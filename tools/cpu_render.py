#!/usr/bin/env python3
"""CPU Renderer for pocketworld.
Faithfully ports GLSL shader pipelines (rain, laundry, layers) from src/shaders.js to Python/numpy.
Supports resume/chunking (--frames a:b), --smoke, and encoding via imageio-ffmpeg / ffmpeg / PIL.
"""

import argparse
import json
import math
import os
import platform
import shutil
import subprocess
import sys
import time
import numpy as np
from PIL import Image

TAU = np.float32(6.2831853)

BAYER4 = np.array([
    [0.0, 0.5, 0.125, 0.625],
    [0.75, 0.25, 0.875, 0.375],
    [0.1875, 0.6875, 0.0625, 0.5625],
    [0.9375, 0.4375, 0.8125, 0.3125],
], dtype=np.float32)

M1 = np.array([
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
], dtype=np.float64)

M2 = np.array([
    [0.2104542553, 0.7936177850, -0.0040720468],
    [1.9779984951, -2.4285922050, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.8086757660],
], dtype=np.float64)

CH_WEIGHT = np.array([1.0, 2.0, 2.0], dtype=np.float32)

# SwiftShader lowers LLVM fmuladd differently on its ARM and x86 targets.
# This is observable after sin's error is magnified by the hash multiplier.
# The override also supports software-renderer builds with different JIT flags.
MATH_MODE = os.environ.get('POCKETWORLD_SHADER_MATH',
                           'fused' if platform.machine().lower() in ('arm64', 'aarch64') else 'separate')
if MATH_MODE not in ('fused', 'separate'):
    raise ValueError('POCKETWORLD_SHADER_MATH must be fused or separate')


def fma(a, b, c):
    """Match the software reference's architecture-specific MulAdd lowering."""
    if MATH_MODE == 'separate':
        return np.asarray(a, dtype=np.float32) * np.asarray(b, dtype=np.float32) + np.asarray(c, dtype=np.float32)
    return (np.asarray(a, dtype=np.float64) * np.asarray(b, dtype=np.float64)
            + np.asarray(c, dtype=np.float64)).astype(np.float32)


def shader_sin(x):
    """Match the software WebGL reference, not libm's different sin approximation.

    SwiftShader ShaderCore.cpp Sin/Sin5: range reduction + degree-5 polynomial.
    https://github.com/google/swiftshader/blob/master/src/Pipeline/ShaderCore.cpp
    A tiny sin error becomes a different random value after fract(sin(x)*43758).
    """
    x = np.asarray(x, dtype=np.float32)
    h = fma(x, np.float32(-1 / (2 * np.float32(math.pi))), np.float32(.25))
    z = np.float32(.25) - np.abs(h - np.rint(h))
    z2 = z * z
    a = np.float32((36288 - 20736 * math.sqrt(3)) / 5)
    b = np.float32(288 * math.sqrt(3) - 540)
    c = np.float32((47 - 9 * math.sqrt(3)) / 5)
    return fma(fma(a, z2, b), z2, c) * z


def shader_cos(x):
    x = np.asarray(x, dtype=np.float32)
    h = x * np.float32(1 / (2 * np.float32(math.pi)))
    z = np.float32(.25) - np.abs(h - np.rint(h))
    z2 = z * z
    a = np.float32((36288 - 20736 * math.sqrt(3)) / 5)
    b = np.float32(288 * math.sqrt(3) - 540)
    c = np.float32((47 - 9 * math.sqrt(3)) / 5)
    return fma(fma(a, z2, b), z2, c) * z


def fract(x):
    return x - np.floor(x)


def hash_xy(x, y):
    x = np.asarray(x, dtype=np.float32)
    y = np.asarray(y, dtype=np.float32)
    d = fma(y, np.float32(311.7), x * np.float32(127.1))
    s = shader_sin(d) * np.float32(43758.5453)
    return fract(s)


def hash1(n):
    n = np.asarray(n, dtype=np.float32)
    d = n * np.float32(91.345)
    s = shader_sin(d) * np.float32(43758.5453)
    return fract(s)


def noise(px, py):
    ix = np.floor(px).astype(np.float32)
    iy = np.floor(py).astype(np.float32)
    fx = px - ix
    fy = py - iy
    fx = fx * fx * (np.float32(3.0) - np.float32(2.0) * fx)
    fy = fy * fy * (np.float32(3.0) - np.float32(2.0) * fy)

    h00 = hash_xy(ix, iy)
    h10 = hash_xy(ix + np.float32(1.0), iy)
    h01 = hash_xy(ix, iy + np.float32(1.0))
    h11 = hash_xy(ix + np.float32(1.0), iy + np.float32(1.0))

    top = h00 + (h10 - h00) * fx
    bot = h01 + (h11 - h01) * fx
    return top + (bot - top) * fy


def ease(x):
    return x * x * (np.float32(3.0) - np.float32(2.0) * x)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (np.float32(3.0) - np.float32(2.0) * t)


def samp_bilinear(tex, px, py, G):
    """Samples tex (H, W, C) at cell centers px, py (where p = c + 0.5).
    In GLSL: texture(s, p/G) with GL_CLAMP_TO_EDGE.
    Texel center of (x0, y0) is at integer + 0.5.
    So continuous texel index is p - 0.5.
    """
    x = px - 0.5
    y = py - 0.5
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    fx = (x - x0)[..., None].astype(np.float32)
    fy = (y - y0)[..., None].astype(np.float32)

    x0_c = np.clip(x0, 0, G - 1)
    x1_c = np.clip(x0 + 1, 0, G - 1)
    y0_c = np.clip(y0, 0, G - 1)
    y1_c = np.clip(y0 + 1, 0, G - 1)

    top = (np.float32(1.0) - fx) * tex[y0_c, x0_c] + fx * tex[y0_c, x1_c]
    bot = (np.float32(1.0) - fx) * tex[y1_c, x0_c] + fx * tex[y1_c, x1_c]
    return (np.float32(1.0) - fy) * top + fy * bot


def oklab_vec(c):
    c = np.clip(c, 0.0, 1.0)
    c_lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    lms = np.maximum(c_lin @ M1.astype(c.dtype).T, 0.0) ** (1.0 / 3.0)
    return lms @ M2.astype(c.dtype).T


def dither_and_quantize(col, cov, fx, th, spread, uPal, uLab, uN, profile, r=None):
    """Applies Bayer dither and OKLab palette matching matching GLSL shaders."""
    L = oklab_vec(col)
    L[..., 0] += (th - 0.5) * spread

    # K is the number of palette candidates searched
    K = (uN - 3) if profile == "rain" else (uN - 1)
    uLab_cand = uLab[:K]

    # Match the shader's subtract / weighted squared distance, without the
    # cancellation introduced by a dot-product distance expansion.
    best = np.zeros(col.shape[:2], dtype=np.int32)
    distance = np.full(col.shape[:2], np.inf, dtype=np.float32)
    for i in range(K):
        e = (L - uLab_cand[i]) * CH_WEIGHT
        dd = fma(e[..., 2], e[..., 2], fma(e[..., 1], e[..., 1], e[..., 0] * e[..., 0]))
        better = dd < distance
        best[better] = i
        distance[better] = dd[better]

    outc = uPal[best].copy()

    # Paper test
    if profile == "rain":
        cov_test = np.maximum(cov, fx * 0.9)
        paper_mask = cov_test < (0.1 + 0.8 * th)
        outc[paper_mask] = uPal[uN - 3]
        if r is not None:
            rain_paper = paper_mask & (r > 0.22) & (th < r * 1.2)
            outc[rain_paper] = uPal[uN - 2]
    elif profile == "laundry":
        paper_mask = cov < (0.1 + 0.8 * th)
        outc[paper_mask] = uPal[uN - 1]
    else:  # layers
        cov_test = np.maximum(cov, fx)
        paper_mask = cov_test < (0.1 + 0.8 * th)
        outc[paper_mask] = uPal[uN - 1]

    return np.clip(np.round(outc * 255.0), 0, 255).astype(np.uint8)

def rain_layer_calc(px, py, t, slope, lane, length, rep, slot, dens, wid, seed, loop):
    u = px + py * slope
    li = np.floor(u / lane).astype(np.float32)
    off = (hash1(li * np.float32(3.7) + np.float32(seed)) - 0.5) * (lane - 2.0 * wid)
    du = (u - (li + 0.5) * lane - off) / math.sqrt(1.0 + slope * slope)
    across = np.exp(-du * du / (2.0 * wid * wid))

    mask = across >= 0.02
    res = np.zeros_like(px, dtype=np.float32)
    if not np.any(mask):
        return res

    li_m = li[mask]
    py_m = py[mask]
    across_m = across[mask]

    v = py_m - (rep / loop) * t + hash1(li_m * np.float32(7.1) + np.float32(seed)) * rep
    k = np.mod(np.floor(v / slot), rep / slot)
    h_dens = hash_xy(li_m + seed * 13.0, k)
    dens_mask = h_dens <= dens
    if not np.any(dens_mask):
        return res

    v_dm = v[dens_mask]
    k_dm = k[dens_mask]
    li_dm = li_m[dens_mask]
    across_dm = across_m[dens_mask]

    f = slot * (1.0 - fract(v_dm / slot))
    L = length * (0.7 + 0.6 * hash_xy(k_dm, li_dm + 3.0))
    along = smoothstep(0.0, 0.9, f) * np.exp(-f / L)

    res_vals = across_dm * along
    temp = np.zeros(mask.sum(), dtype=np.float32)
    temp[dens_mask] = res_vals
    res[mask] = temp
    return res


def breeze(s, ph, phase):
    return (shader_sin(ph * 3.0 - TAU * 0.65 * s + phase) +
            0.22 * shader_sin(ph * 6.0 - TAU * 1.3 * s + 2.0 * phase + 1.0)) * (
            0.82 + 0.18 * shader_sin(ph + phase * 0.7))


def breeze_d(s, ph, phase):
    return shader_cos(ph * 3.0 - TAU * 0.65 * s + phase)


def cloth_disp(f, ph):
    w = f[..., 0] * 1.15
    s = f[..., 1] * 1.4 - 0.2
    A = f[..., 2] * 4.0
    phs = f[..., 3] * TAU
    b = breeze(s, ph, phs)
    ww = np.power(np.clip(w, 0.0, 1.15), 1.35)
    n = np.array([-0.9, 0.45], dtype=np.float32)
    n = n / np.linalg.norm(n)
    fold = breeze_d(s, ph, phs) * w
    dx = A * ww * b * n[0]
    dy = A * ww * b * n[1] - 0.35 * A * w * w * np.power(np.abs(b), 1.5)
    return dx, dy, fold


def mote_field(px, py, ph, uMote, uNM):
    mo = np.zeros_like(px, dtype=np.float32)
    for i in range(min(8, uNM)):
        fi = float(i)
        cen_x = uMote[i][0] + 5.0 * shader_sin(ph + fi * 1.7) + 2.0 * shader_sin(ph * 2.0 + fi)
        cen_y = uMote[i][1] - 4.0 * shader_cos(ph + fi * 1.7) + 1.5 * shader_cos(ph * 3.0 + fi * 2.3)
        tw = 0.5 + 0.5 * shader_sin(ph * 3.0 + fi * 2.1)
        ex = px - cen_x
        ey = py - cen_y
        dist2 = ex * ex + ey * ey
        mo = np.maximum(mo, np.exp(-dist2 / (2.0 * 0.55 * 0.55)) * tw)
    return mo


def stroke(u, snap=0.0, duty=1.0):
    if 0.0 < duty < 1.0:
        if u >= duty:
            return 0.0
        u = u / duty
    s = min(0.3, max(-0.3, snap))
    return 0.5 - 0.5 * math.cos(2.0 * math.pi * (u + s * math.sin(math.pi * u)))


def mul_mat(m, n):
    return [
        m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ]


def inv_mat(m):
    det = m[0] * m[3] - m[1] * m[2]
    a, b, c, d = m[3] / det, -m[1] / det, -m[2] / det, m[0] / det
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]


def compute_part_transforms(parts, t, loop):
    out = []
    for pt in parts:
        u = (((pt['k'] * t) / loop + pt.get('phase', 0.0)) % 1.0 + 1.0) % 1.0
        if pt.get('kind') == 'path':
            rx, ry = pt['radius']
            L = [1.0, 0.0, 0.0, 1.0, rx * math.sin(2.0 * math.pi * u), -ry * math.sin(4.0 * math.pi * u)]
        else:
            th = pt.get('bias', 0.0) + pt.get('amp', 0.0) * stroke(u, pt.get('snap', 0.0), pt.get('duty', 1.0))
            cs, sn = math.cos(th), math.sin(th)
            px, py = pt.get('pivot', [0, 0])
            L = [cs, sn, -sn, cs, px - cs * px + sn * py, py - sn * px - cs * py]
        parent = pt.get('parent', -1)
        out.append(mul_mat(out[parent], L) if parent >= 0 else L)
    return out


def steam_puff(px, py, origin, ph):
    mo = np.zeros_like(px, dtype=np.float32)
    for i in range(3):
        fi = float(i)
        age = fract(ph / float(TAU) * 3.0 + fi / 3.0)
        qx = origin[0] + 1.6 * shader_sin(ph * 2.0 + fi * 2.1)
        qy = origin[1] - age * 16.0
        w = shader_sin(math.pi * age)
        ex = px - qx
        ey = py - qy
        dist2 = ex * ex + ey * ey
        mo = np.maximum(mo, np.exp(-dist2 / (1.4 + age * 5.5)) * w)
    return mo


def light_env(mode, k, phs, px, py, ph):
    if mode < 0.5:
        return 0.5 + 0.5 * shader_sin(ph * k + phs)
    elif mode < 1.5:
        c1, s1 = shader_cos(ph * k + phs), shader_sin(ph * k + phs)
        c2, s2 = shader_cos(ph * 13.0), shader_sin(ph * 13.0)
        n1 = noise(np.float32(3.0 * c1), np.float32(3.0 * s1))
        n2 = noise(np.float32(5.3 + 2.0 * c2), np.float32(5.3 + 2.0 * s2))
        return 0.55 * n1 + 0.45 * n2
    elif mode < 2.5:
        return np.power(0.5 + 0.5 * shader_sin(ph * k + phs - (px + py) * 0.15), 14.0)
    else:
        return 0.75 + 0.25 * shader_sin(ph * k + phs)


def render_rain_frame(manifest, textures, t):
    G = int(manifest['grid'])
    loop = float(manifest['loop'])
    ph = np.float32(np.float32(TAU * np.float32(t)) / np.float32(loop))
    uPivot = np.array(manifest.get('pivot', [0, 0]), dtype=np.float32)

    cx = np.arange(G, dtype=np.float32)[None, :]
    cy = np.arange(G, dtype=np.float32)[:, None]
    px = np.broadcast_to(cx + 0.5, (G, G)).copy()
    py = np.broadcast_to(cy + 0.5, (G, G)).copy()

    uBase = textures['base']
    uFill = textures['fill']
    uMask = textures['mask']
    uMask2 = textures['mask2']
    uMask3 = textures['mask3']
    uMask4 = textures['mask4']

    wet = uMask[..., 0]
    rainAmt = uMask[..., 1]
    glow = uMask[..., 2]
    detail = uMask2[..., 1]
    outl = uMask2[..., 2]
    covBig = uMask3[..., 2]

    col = uBase[..., :3].copy()
    cov = uMask2[..., 0].copy()

    # umbrella sway
    sw = math.radians(1.7) * shader_sin(ph * 3.0 + 0.6)
    cos_sw, sin_sw = shader_cos(sw), shader_sin(sw)
    dx = px - uPivot[0]
    dy = py - uPivot[1]
    # GLSL mat2 is column-major: mat2(cs,-sn,sn,cs).
    pu_x = uPivot[0] + cos_sw * dx + sin_sw * dy
    pu_y = uPivot[1] - sin_sw * dx + cos_sw * dy

    samp_m3_pu = samp_bilinear(uMask3, pu_x, pu_y, G)
    ua = samp_m3_pu[..., 0]
    ua0 = uMask3[..., 0]

    br = 0.5 - 0.5 * shader_cos(ph * 3.0 + 2.2)
    br = float(ease(np.float32(br)))
    pm_x = px
    pm_y = py + 0.45 * br * uMask3[..., 1]

    samp_m3_pm = samp_bilinear(uMask3, pm_x, pm_y, G)
    ma = samp_m3_pm[..., 1]
    ma0 = uMask3[..., 1]

    umbrella_inf = np.maximum(np.maximum(ua, ua0), np.maximum(ma, ma0))
    umb_mask = umbrella_inf > 0.001
    if np.any(umb_mask):
        bg = uFill[..., :3]
        bgc = uMask4[..., 0]
        cc = bg.copy()
        cv = bgc.copy()

        samp_base_pm = samp_bilinear(uBase, pm_x, pm_y, G)[..., :3]
        samp_mask2_pm = samp_bilinear(uMask2, pm_x, pm_y, G)[..., 0]
        mA = np.clip(ma * 3.0, 0.0, 1.0)[..., None]
        cc = (1.0 - mA) * cc + mA * samp_base_pm
        cv = (1.0 - mA[..., 0]) * cv + mA[..., 0] * samp_mask2_pm

        samp_base_pu = samp_bilinear(uBase, pu_x, pu_y, G)[..., :3]
        samp_mask2_pu = samp_bilinear(uMask2, pu_x, pu_y, G)[..., 0]
        uA = np.clip(ua * 2.0, 0.0, 1.0)[..., None]
        cc = (1.0 - uA) * cc + uA * samp_base_pu
        cv = (1.0 - uA[..., 0]) * cv + uA[..., 0] * samp_mask2_pu

        inf = np.clip(umbrella_inf * 4.0, 0.0, 1.0)
        inf3 = inf[..., None]
        col = np.where(umb_mask[..., None], (1.0 - inf3) * col + inf3 * cc, col)
        cov = np.where(umb_mask, (1.0 - inf) * cov + inf * cv, cov)
        outl = np.where(umb_mask, outl * (1.0 - inf), outl)

    # lamp glow breathes
    lb = 0.5 + 0.5 * shader_sin(ph * 2.0 - 1.0)
    glow_factor = (glow * (0.06 + 0.10 * lb) * (1.0 - detail))[..., None]
    glow_col = np.array([1.0, 0.86, 0.58], dtype=np.float32)
    col = (1.0 - glow_factor) * col + glow_factor * glow_col

    # water shimmer
    wet_mask = wet > 0.02
    if np.any(wet_mask):
        qx = px * 0.16
        qy = py * 0.36
        cos_ph, sin_ph = shader_cos(ph), shader_sin(ph)
        cos_ph2_1, sin_ph2_1 = shader_cos(ph * 2.0 + 1.0), shader_sin(ph * 2.0 + 1.0)
        cos_ph4, sin_ph4 = shader_cos(ph * 4.0), shader_sin(ph * 4.0)

        n1 = noise(qx + 2.5 * cos_ph, qy + 2.5 * sin_ph)
        n2 = noise(qx * 1.9 + 7.3 + 1.6 * cos_ph2_1, qy * 1.9 + 7.3 + 1.6 * sin_ph2_1)
        n3 = noise(px * 0.45 + 3.1 + 1.2 * cos_ph4, py * 0.9 + 3.1 + 1.2 * sin_ph4)
        sp = smoothstep(0.60, 0.86, 0.55 * n1 + 0.3 * n2 + 0.15 * n3)

        shimmer_col = np.array([0.80, 0.86, 0.93], dtype=np.float32)
        shimmer_fac = (wet * sp * 0.32)[..., None]
        col = np.where(wet_mask[..., None], (1.0 - shimmer_fac) * col + shimmer_fac * shimmer_col, col)

        cos_ph2, sin_ph2 = shader_cos(ph * 2.0), shader_sin(ph * 2.0)
        wob = noise(py * 0.3 + 2.0 * cos_ph2, np.float32(1.7 + 2.0 * sin_ph2)) - 0.5
        col = np.where(wet_mask[..., None], col * (1.0 + (wet * glow * wob * 0.22)[..., None]), col)

    # ripples
    rip_mask = wet > 0.4
    rip = np.zeros((G, G), dtype=np.float32)
    uRip = manifest.get('ripples', [])
    if np.any(rip_mask) and len(uRip) > 0:
        for i in range(21):
            fi = float(i)
            if i < 13:
                t0 = fi * loop / 13.0
                life = 2.4
                rmax = 9.0
                per = loop
            else:
                t0 = (fi * 1.37) % 3.0
                life = 1.6
                rmax = 5.0
                per = 3.0
            age = (t - t0) % per
            if age > life:
                continue
            if i < 13:
                pi_idx = i
            else:
                pi_idx = 13 + (i - 13) * 3 + int(math.floor((t - t0) / 3.0) % 4) % 3
            cen = uRip[pi_idx % len(uRip)]
            s = age / life
            r = 0.8 + rmax * (1.0 - (1.0 - s) ** 3)
            ex = px - cen[0]
            ey = (py - cen[1]) * 2.2
            dd = np.sqrt(ex * ex + ey * ey)
            gr_denom = np.maximum(dd, 1e-3)
            gr = np.maximum(np.sqrt(ex * ex + ey * ey * 2.2 * 2.2) / gr_denom, 1e-3)
            ring = np.exp(-np.power((dd - r) / gr, 2.0) / (2.0 * 0.35 * 0.35))
            ring2 = np.exp(-np.power((dd - 0.55 * r) / gr, 2.0) / (2.0 * 0.35 * 0.35)) * 0.45
            a = ((1.0 - s) ** 2.0) * float(smoothstep(0.0, 0.06, s))
            rip = np.maximum(rip, (ring + ring2) * a)

        rip_fac = (np.clip(rip, 0.0, 1.0) * 0.75 * smoothstep(0.4, 0.8, wet))[..., None]
        rip_col = np.array([0.83, 0.88, 0.94], dtype=np.float32)
        col = np.where(rip_mask[..., None], (1.0 - rip_fac) * col + rip_fac * rip_col, col)

    # drips
    fx = np.zeros((G, G), dtype=np.float32)
    uDrip = manifest.get('drips', [])
    for i in range(min(12, len(uDrip))):
        dp = uDrip[i]
        fi = float(i)
        per = loop / float(2 + int(float(hash1(fi + 0.3)) * 3.0))
        age = (t + float(hash1(fi)) * per) % per
        hang = 1.1
        fall = 0.42 * math.sqrt(dp[2] / 40.0)
        if age < hang:
            y = 0.0
            a = float(ease(np.float32(age / hang))) * 0.7
            sm = 0.5
        elif age < hang + fall:
            s_val = (age - hang) / fall
            y = dp[2] * s_val * s_val
            a = 0.9
            sm = 0.5 + 2.0 * s_val
        else:
            a = 0.0
            y = 0.0
            sm = 0.5

        if a > 0.0:
            dvx = px - dp[0]
            dvy = py - (dp[1] + y)
            term_y = np.maximum(0.0, -dvy) / sm + np.maximum(0.0, dvy) / 0.6
            g = np.exp(-dvx * dvx / (2.0 * 0.32)) * np.exp(-term_y * term_y * 0.5)
            lum = np.sum(col * np.array([0.3, 0.59, 0.11], dtype=np.float32), axis=-1, keepdims=True)
            dc = np.where(lum > 0.6, np.array([0.40, 0.47, 0.57], dtype=np.float32),
                                   np.array([0.88, 0.92, 0.97], dtype=np.float32))
            ga = (g * a)[..., None]
            col = (1.0 - ga) * col + ga * dc
            fx = np.maximum(fx, g * a)

        sa = age - hang - fall
        if 0.0 < sa < 0.5:
            gpx = px - dp[0]
            gpy = (py - (dp[1] + dp[2])) * 2.1
            dd = np.sqrt(gpx * gpx + gpy * gpy)
            rr = 0.5 + 3.5 * (1.0 - (1.0 - sa / 0.5) ** 2.0)
            ring = np.exp(-((dd - rr) ** 2.0) / 0.18) * (1.0 - sa / 0.5)
            ring_fac = (ring * 0.7)[..., None]
            col = (1.0 - ring_fac) * col + ring_fac * np.array([0.83, 0.88, 0.94], dtype=np.float32)

    # rain streaks
    r = np.zeros((G, G), dtype=np.float32)
    rz = rainAmt * smoothstep(0.15, 0.7, covBig)
    rz_mask = rz > 0.01
    if np.any(rz_mask):
        r1 = 0.55 * rain_layer_calc(px, py, t, 0.42, 6.0, 5.0, 240.0, 20.0, 0.55, 0.38, 1.0, loop)
        r2 = 0.75 * rain_layer_calc(px, py, t, 0.42, 9.0, 7.0, 336.0, 28.0, 0.50, 0.45, 2.0, loop)
        r3 = 0.95 * rain_layer_calc(px, py, t, 0.42, 13.0, 10.0, 432.0, 36.0, 0.45, 0.55, 3.0, loop)
        r = np.maximum(np.maximum(r1, r2), r3)
        r = r * smoothstep(0.0, 0.7, rz)
        rc = (1.0 - (glow * 0.8)[..., None]) * np.array([0.80, 0.85, 0.92], dtype=np.float32) + (
                (glow * 0.8)[..., None]) * np.array([1.0, 0.90, 0.72], dtype=np.float32)
        col = (1.0 - r[..., None]) * col + r[..., None] * rc

    th = BAYER4[cy.astype(int) % 4, cx.astype(int) % 4]
    uSpread = float(manifest['spread'])
    spread = uSpread * (1.0 + (0.45 - 1.0) * detail) * (1.0 - outl)

    uPal = np.array(manifest['palette'], dtype=np.float32) / 255.0
    uLab = oklab_vec(np.array(manifest["palette"], dtype=np.float64) / 255.0).astype(np.float32)
    uN = len(uPal)

    return dither_and_quantize(col, cov, fx, th, spread, uPal, uLab, uN, "rain", r)


def render_laundry_frame(manifest, textures, t):
    G = int(manifest['grid'])
    loop = float(manifest['loop'])
    ph = np.float32(np.float32(TAU * np.float32(t)) / np.float32(loop))

    cx = np.arange(G, dtype=np.float32)[None, :]
    cy = np.arange(G, dtype=np.float32)[:, None]
    px = np.broadcast_to(cx + 0.5, (G, G)).copy()
    py = np.broadcast_to(cy + 0.5, (G, G)).copy()

    uBase = textures['base']
    uFill = textures['fill']
    uCloth = textures['cloth']
    uCfield = textures['cfield']
    uMask = textures['mask']
    uMask2 = textures['mask2']
    uMask3 = textures['mask3']
    uSfield = textures['sfield']

    cov = uMask[..., 0].copy()
    detail = uMask[..., 1]
    bgc = uMask[..., 2]
    inCloth = uMask[..., 3]
    col = uBase[..., :3].copy()
    bg = uFill[..., :3]

    # shadow
    s_mask = uMask3[..., 1] > 0.004
    if np.any(s_mask):
        sf = samp_bilinear(uSfield, px, py, G)
        b = breeze(sf[..., 1] * 1.4 - 0.2, ph, sf[..., 3] * TAU)
        n = np.array([-0.9, 0.45], dtype=np.float32)
        n = n / np.linalg.norm(n)
        d_scale = (sf[..., 2] * 4.0 * sf[..., 0] * b)[..., None] * n
        dx = d_scale[..., 0]
        dy = d_scale[..., 1]
        S0 = np.maximum(uMask3[..., 0], 0.35)
        S1 = np.maximum(samp_bilinear(uMask3, px - dx, py - dy, G)[..., 0], 0.35)
        shadow_col = col / S0[..., None] * S1[..., None]
        m3_g = uMask3[..., 1, None]
        col = np.where(s_mask[..., None], (1.0 - m3_g) * col + m3_g * shadow_col, col)

    # cloth
    cloth_mask = inCloth > 0.5
    if np.any(cloth_mask):
        f = samp_bilinear(uCfield, px, py, G)
        dx, dy, fold = cloth_disp(f, ph)
        cl = samp_bilinear(uCloth, px - dx, py - dy, G)
        a = smoothstep(0.25, 0.75, cl[..., 3])
        cc = cl[..., :3] / np.maximum(cl[..., 3, None], 1e-3)
        cc = cc * (1.0 + 0.08 * fold[..., None])

        cl0 = uCloth
        cl_valid = (np.maximum(cl0[..., 3], cl[..., 3]) > 0.01) & cloth_mask
        a_3 = a[..., None]
        mix_col = (1.0 - a_3) * bg + a_3 * cc
        mix_cov = (1.0 - a) * bgc + a * 1.0

        col = np.where(cl_valid[..., None], mix_col, col)
        cov = np.where(cl_valid, mix_cov, cov)

        m3_b = uMask3[..., 2, None]
        col = np.where(cloth_mask[..., None], (1.0 - m3_b) * col + m3_b * uBase[..., :3], col)
        cov = np.where(cloth_mask, (1.0 - uMask3[..., 2]) * cov + uMask3[..., 2] * uMask[..., 0], cov)

    # creature
    m2 = uMask2
    c_mask = (m2[..., 1] > 0.001) | (m2[..., 3] > 0.001) | (m2[..., 0] > 0.001)
    if np.any(c_mask):
        br = float(ease(np.float32(0.5 - 0.5 * shader_cos(ph * 4.0))))
        et = (t - 7.4) % loop
        ef = (shader_sin(math.pi * et / 0.5) if et < 0.5 else 0.0) ** 2.0
        qx = px + 0.25 * ef * m2[..., 3]
        qy = py + 0.38 * br * m2[..., 1] + 0.55 * ef * m2[..., 3]
        samp_m2 = samp_bilinear(uMask2, qx, qy, G)
        ca = np.clip(samp_m2[..., 0] * 1.6, 0.0, 1.0)
        ca0 = m2[..., 0]
        active = (np.maximum(ca, ca0) > 0.01) & c_mask
        if np.any(active):
            samp_base = samp_bilinear(uBase, qx, qy, G)[..., :3]
            cc = (1.0 - ca[..., None]) * bg + ca[..., None] * samp_base
            weight = np.clip(np.maximum(ca, ca0) * 3.0, 0.0, 1.0)[..., None]
            col = np.where(active[..., None], (1.0 - weight) * col + weight * cc, col)

    # motes
    uMote = manifest.get('motes', [])
    uNM = len(uMote)
    mo = mote_field(px, py, ph, uMote, uNM)
    mote_col = np.array([1.0, 0.97, 0.88], dtype=np.float32)
    mo_fac = (mo * 0.45 * smoothstep(0.3, 0.8, cov))[..., None]
    col = (1.0 - mo_fac) * col + mo_fac * mote_col

    th = BAYER4[cy.astype(int) % 4, cx.astype(int) % 4]
    uSpread = float(manifest['spread'])
    spread = uSpread * (1.0 + (0.45 - 1.0) * detail)

    uPal = np.array(manifest['palette'], dtype=np.float32) / 255.0
    uLab = oklab_vec(np.array(manifest["palette"], dtype=np.float64) / 255.0).astype(np.float32)
    uN = len(uPal)

    return dither_and_quantize(col, cov, 0.0, th, spread, uPal, uLab, uN, "laundry")


def render_layers_frame(manifest, textures, t):
    G = int(manifest['grid'])
    loop = float(manifest['loop'])
    ph = np.float32(np.float32(TAU * np.float32(t)) / np.float32(loop))

    cx = np.arange(G, dtype=np.float32)[None, :]
    cy = np.arange(G, dtype=np.float32)[:, None]
    px = np.broadcast_to(cx + 0.5, (G, G)).copy()
    py = np.broadcast_to(cy + 0.5, (G, G)).copy()

    uBase = textures['base']
    uFill = textures['fill']
    uMask = textures['mask']
    uSoft = textures['soft']
    uSoft2 = textures['soft2']
    uPart = textures['part']
    uPa0 = textures['pa0']
    uPa1 = textures['pa1']
    uLight = textures['light']
    uZone = textures['zone']

    m = uMask
    g = uSoft2
    detail = m[..., 1]
    m_a = m[..., 3, None]
    col = (1.0 - m_a) * uBase[..., :3] + m_a * uFill[..., :3]
    cov = (1.0 - m[..., 3]) * m[..., 0] + m[..., 3] * m[..., 2]

    # 1. soft deform
    f = samp_bilinear(uSoft, px, py, G)
    soft_active = (f[..., 0] * f[..., 2]) > 0.0005
    if np.any(soft_active):
        w = f[..., 0] * 1.15
        s = f[..., 1] * 1.4 - 0.2
        A = f[..., 2] * 4.0
        phs = f[..., 3] * TAU
        b = breeze(s, ph, phs)
        g_samp = samp_bilinear(uSoft2, px, py, G)
        an = g_samp[..., 1] * TAU
        cos_an, sin_an = shader_cos(an), shader_sin(an)

        foliage = g_samp[..., 0] > 0.5
        c4, s4 = shader_cos(ph * 4.0), shader_sin(ph * 4.0)
        # noise for foliage
        flutter = 0.45 * (noise(px * 0.12 + 2.0 * shader_cos(ph * 4.0 + phs),
                                py * 0.12 + 2.0 * shader_sin(ph * 4.0 + phs)) - 0.5)
        b_foliage = b + flutter

        dx_fol = A * w * b_foliage * cos_an
        dy_fol = A * w * b_foliage * sin_an

        ww = np.power(np.clip(w, 0.0, 1.15), 1.35)
        dx_cloth = A * ww * b * cos_an
        dy_cloth = A * ww * b * sin_an - 0.35 * A * w * w * np.power(np.abs(b), 1.5)

        dx = np.where(foliage, dx_fol, dx_cloth)
        dy = np.where(foliage, dy_fol, dy_cloth)

        qx = px - dx
        qy = py - dy
        samp_b = samp_bilinear(uBase, qx, qy, G)[..., :3]
        samp_f = samp_bilinear(uFill, qx, qy, G)[..., :3]
        samp_m = samp_bilinear(uMask, qx, qy, G)
        ma_q = samp_m[..., 3, None]
        col_deform = (1.0 - ma_q) * samp_b + ma_q * samp_f
        cov_deform = (1.0 - samp_m[..., 3]) * samp_m[..., 0] + samp_m[..., 3] * samp_m[..., 2]

        col = np.where(soft_active[..., None], col_deform, col)
        cov = np.where(soft_active, cov_deform, cov)

    # 6. light
    lights = manifest.get('lights', [])
    for i in range(min(4, len(lights))):
        lp = lights[i]
        mode, k, amp, sway = lp['mode'], lp['k'], lp['amp'], lp['sway']
        col_light = np.array(lp['color'], dtype=np.float32)
        q_light_x = px - sway * shader_sin(ph * k + float(i))
        q_light_y = py - sway * 0.3 * shader_cos(ph * k + float(i))
        w = samp_bilinear(uLight, q_light_x, q_light_y, G)[..., i]
        light_active = w >= 0.002
        if np.any(light_active):
            e = light_env(mode, k, float(i) * 1.3, px, py, ph)
            we = (w * amp * e)[..., None]
            if mode > 2.5:
                col = np.where(light_active[..., None], col * (1.0 - we), col)
            else:
                col = np.where(light_active[..., None], (1.0 - we) * col + we * col_light, col)

    # 2 + 3. rigid and path parts
    parts = manifest.get('parts', [])
    if len(parts) > 0:
        inv_transforms = [inv_mat(m) for m in compute_part_transforms(parts, t, loop)]
        for i in range(min(8, len(parts))):
            inv_m = inv_transforms[i]
            # q = mat2(inv_m) * p + inv_m.t
            # x' = a*px + c*py + tx
            # y' = b*px + d*py + ty
            qx = inv_m[0] * px + inv_m[2] * py + inv_m[4]
            qy = inv_m[1] * px + inv_m[3] * py + inv_m[5]
            if i < 4:
                a_part = samp_bilinear(uPa0, qx, qy, G)[..., i]
            else:
                a_part = samp_bilinear(uPa1, qx, qy, G)[..., i - 4]
            a_smooth = smoothstep(0.2, 0.7, a_part)
            part_active = a_smooth > 0.0
            if np.any(part_active):
                pc = samp_bilinear(uPart, qx, qy, G)
                a3 = a_smooth[..., None]
                col = np.where(part_active[..., None], (1.0 - a3) * col + a3 * pc[..., :3], col)
                cov = np.where(part_active, (1.0 - a_smooth) * cov + a_smooth * pc[..., 3], cov)

    # 5. surface waves
    wet = g[..., 2]
    wave = manifest.get('wave', [0.0, 0.0])
    wet_mask = wet > 0.02
    if np.any(wet_mask):
        cos_ph, sin_ph = shader_cos(ph), shader_sin(ph)
        cos_ph2_1, sin_ph2_1 = shader_cos(ph * 2.0 + 1.0), shader_sin(ph * 2.0 + 1.0)
        cos_ph4, sin_ph4 = shader_cos(ph * 4.0), shader_sin(ph * 4.0)

        qx = px * 0.16
        qy = py * 0.36
        n1 = noise(qx + 2.5 * cos_ph, qy + 2.5 * sin_ph)
        n2 = noise(qx * 1.9 + 7.3 + 1.6 * cos_ph2_1, qy * 1.9 + 7.3 + 1.6 * sin_ph2_1)
        n3 = noise(px * 0.45 + 3.1 + 1.2 * cos_ph4, py * 0.9 + 3.1 + 1.2 * sin_ph4)
        sp = smoothstep(0.60, 0.86, 0.55 * n1 + 0.3 * n2 + 0.15 * n3)

        shimmer_col = np.array([0.80, 0.86, 0.93], dtype=np.float32)
        shimmer_fac = (wet * sp * 0.32 * wave[0])[..., None]
        col = np.where(wet_mask[..., None], (1.0 - shimmer_fac) * col + shimmer_fac * shimmer_col, col)

        if wave[1] > 0.0:
            uRip = manifest.get('ripples', [])
            rip = np.zeros((G, G), dtype=np.float32)
            if len(uRip) > 0:
                for i in range(13):
                    fi = float(i)
                    age = (t - fi * loop / 13.0) % loop
                    if age > 2.4:
                        continue
                    s = age / 2.4
                    r = 0.8 + 9.0 * (1.0 - (1.0 - s) ** 3.0)
                    cen = uRip[(i * 3) % len(uRip)]
                    ex = px - cen[0]
                    ey = (py - cen[1]) * 2.2
                    dd = np.sqrt(ex * ex + ey * ey)
                    ring = np.exp(-((dd - r) ** 2.0) / (2.0 * 0.35 * 0.35)) + 0.45 * np.exp(
                        -((dd - 0.55 * r) ** 2.0) / (2.0 * 0.35 * 0.35))
                    rip = np.maximum(rip, ring * ((1.0 - s) ** 2.0) * float(smoothstep(0.0, 0.06, s)))
            rip_fac = (np.clip(rip, 0.0, 1.0) * 0.75 * wave[1] * smoothstep(0.4, 0.8, wet))[..., None]
            col = np.where(wet_mask[..., None],
                           (1.0 - rip_fac) * col + rip_fac * np.array([0.83, 0.88, 0.94], dtype=np.float32), col)

    # 4. particles
    fx = np.zeros((G, G), dtype=np.float32)
    z = samp_bilinear(uZone, px, py, G)
    particles = manifest.get('particles', [])
    for i in range(min(4, len(particles))):
        zw = z[..., i]
        zw_active = zw >= 0.01
        if not np.any(zw_active):
            continue
        p_cfg = particles[i]
        kind = p_cfg['kind']
        dens = p_cfg['dens']
        size = p_cfg['size']
        rep = p_cfg['rep']
        color = np.array(p_cfg['color'], dtype=np.float32)

        if kind < 0.5:
            r1 = 0.55 * rain_layer_calc(px, py, t, 0.42, 6.0, 5.0, 240.0, 20.0, 0.55 * dens, 0.38, 1.0 + float(i), loop)
            r2 = 0.75 * rain_layer_calc(px, py, t, 0.42, 9.0, 7.0, 336.0, 28.0, 0.50 * dens, 0.45, 2.0 + float(i), loop)
            r3 = 0.95 * rain_layer_calc(px, py, t, 0.42, 13.0, 10.0, 432.0, 36.0, 0.45 * dens, 0.55, 3.0 + float(i), loop)
            a_p = np.maximum(np.maximum(r1, r2), r3)
        elif kind < 2.5:
            # fallField
            lat = 16.0
            li = np.floor(px / lat).astype(np.float32)
            sway_amp = 4.0 if kind > 1.5 else 2.0
            sway = sway_amp * shader_sin(ph * 3.0 + hash1(li + float(i) * 7.0) * TAU)
            v = py - (rep / loop) * t + hash1(li * np.float32(7.1) + np.float32(float(i) * 7.0)) * rep
            k = np.mod(np.floor(v / lat), rep / lat)
            h_dens = hash_xy(li + float(i) * 7.0 * 13.0, k)
            p_mask = h_dens <= dens

            cen_x = (li + 0.5) * lat + (hash_xy(k, li) - 0.5) * 3.0 + sway
            cen_y = lat * 0.5
            ex = px - cen_x
            ey = np.mod(v, lat) - cen_y
            if kind > 1.5:
                rot_a = ph * 6.0 + hash_xy(li, k) * TAU
                cs, sn = shader_cos(rot_a), shader_sin(rot_a)
                ex_rot = cs * ex + sn * ey
                ey_rot = (-sn * ex + cs * ey) * 2.2
                dist2 = ex_rot * ex_rot + ey_rot * ey_rot
            else:
                dist2 = ex * ex + ey * ey
            a_p = np.where(p_mask, np.exp(-dist2 / (2.0 * size * size)), 0.0)
        elif kind < 3.5:
            # moteLattice
            lat = 22.0
            seed = float(i) * 5.0
            b_x = np.floor(px / lat - 0.5)
            b_y = np.floor(py / lat - 0.5)
            a_p = np.zeros((G, G), dtype=np.float32)
            for j in range(4):
                c_x = b_x + float(j % 2)
                c_y = b_y + float(j // 2)
                h_cell = hash_xy(c_x + seed, c_y + seed)
                cell_mask = h_cell <= dens
                h = hash_xy(c_x * 1.3 + seed, c_y * 1.3 + seed) * TAU
                cen_x = (c_x + 0.5) * lat + 5.0 * shader_sin(ph + h) + 2.0 * shader_sin(ph * 2.0 + h)
                cen_y = (c_y + 0.5) * lat - 4.0 * shader_cos(ph + h) + 1.5 * shader_cos(ph * 3.0 + h * 2.0)
                ex = px - cen_x
                ey = py - cen_y
                dist2 = ex * ex + ey * ey
                mo_val = np.exp(-dist2 / (2.0 * size * size)) * (0.5 + 0.5 * shader_sin(ph * 3.0 + h))
                a_p = np.maximum(a_p, np.where(cell_mask, mo_val, 0.0))
        else:
            # steam
            origin = p_cfg.get('origin', [0, 0])
            a_p = steam_puff(px, py, origin, ph) * 0.6

        a_p = a_p * zw
        a_fac = (a_p * 0.85)[..., None]
        col = (1.0 - a_fac) * col + a_fac * color
        fx = np.maximum(fx, a_p * 0.9)

    th = BAYER4[cy.astype(int) % 4, cx.astype(int) % 4]
    uSpread = float(manifest['spread'])
    spread = uSpread * (1.0 + (0.45 - 1.0) * detail)

    uPal = np.array(manifest['palette'], dtype=np.float32) / 255.0
    uLab = oklab_vec(np.array(manifest["palette"], dtype=np.float64) / 255.0).astype(np.float32)
    uN = len(uPal)

    return dither_and_quantize(col, cov, fx, th, spread, uPal, uLab, uN, "layers")


def render_frame(manifest, textures, t):
    t = float(np.float32(float(t) % float(manifest['loop'])))
    profile = manifest['profile']
    if profile == 'rain':
        return render_rain_frame(manifest, textures, t)
    elif profile == 'laundry':
        return render_laundry_frame(manifest, textures, t)
    elif profile == 'layers':
        return render_layers_frame(manifest, textures, t)
    else:
        raise ValueError(f"Unknown profile: {profile}")


def load_textures(scene_dir, manifest):
    build_dir = os.path.join(scene_dir, 'build')
    textures = {}
    for k, rel in manifest['textures'].items():
        tex_path = os.path.join(build_dir, rel)
        im = Image.open(tex_path).convert('RGBA')
        textures[k] = np.array(im, dtype=np.float32) / 255.0
    return textures



if __name__ == "__main__":
    # Keep the standalone entry point, using exactly the same cache/encoder as the CLI.
    from render_pipeline import main
    sys.argv.insert(1, 'render')
    main()
