#!/usr/bin/env python3
"""pocketworld prep, overlay, suggest, and present.

The reference painting is the base layer. Prep downsamples it to a cell grid,
builds an OKLab palette, inpaints behind moving parts, and writes mask textures.
A WebGL shader (see src/shaders.js) animates those layers and dithers.

Only numpy + Pillow.  usage: python3 tools/pocketworld.py prep <scene-dir>
"""
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

M1 = np.array([[.4122214708, .5363325363, .0514459929],
               [.2119034982, .6806995451, .1073969566],
               [.0883024619, .2817188376, .6299787005]])
M2 = np.array([[.2104542553, .7936177850, -.0040720468],
               [1.9779984951, -2.4285922050, .4505937099],
               [.0259040371, .7827717662, -.8086757660]])
CH = np.array([1., 2.2, 2.2])
LUMA = np.array([.299, .587, .114], np.float32)


def srgb2lin(c):
    c = c / 255
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)

def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return 255 * np.where(c <= .0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - .055)

def oklab(c):
    return np.cbrt(srgb2lin(c) @ M1.T) @ M2.T

def from_oklab(L):
    return lin2srgb((L @ np.linalg.inv(M2).T) ** 3 @ np.linalg.inv(M1).T)

def gblur(a, s):
    if s <= 0:
        return a
    r = int(3 * s + 1)
    x = np.arange(-r, r + 1)
    k = np.exp(-x * x / (2 * s * s))
    k /= k.sum()
    b = np.pad(a, [(r, r), (r, r)] + [(0, 0)] * (a.ndim - 2), mode='edge')
    b = sum(k[i] * b[i:i + a.shape[0]] for i in range(2 * r + 1))
    return sum(k[i] * b[:, i:i + a.shape[1]] for i in range(2 * r + 1))

def kuwahara(img, r):
    lum = img @ LUMA
    def integ(x):
        x = np.pad(x, ((r + 1, r), (r + 1, r)) + ((0, 0),) * (x.ndim - 2), mode='edge')
        return x.cumsum(0).cumsum(1)
    Ic, Il, Il2 = integ(img), integ(lum), integ(lum * lum)
    h, w = lum.shape
    n = (r + 1) ** 2
    def box(I, y0, x0):
        ys = np.arange(h)[:, None] + r + 1 + y0
        xs = np.arange(w)[None] + r + 1 + x0
        return I[ys + r, xs + r] - I[ys - 1, xs + r] - I[ys + r, xs - 1] + I[ys - 1, xs - 1]
    best = bv = None
    for (y0, x0) in [(-r, -r), (-r, 0), (0, -r), (0, 0)]:
        m = box(Il, y0, x0) / n
        v = box(Il2, y0, x0) / n - m * m
        mc = np.stack([box(Ic[..., c], y0, x0) for c in range(3)], -1) / n
        if best is None:
            best, bv = mc, v
        else:
            sel = v < bv
            best[sel] = mc[sel]
            bv = np.minimum(bv, v)
    return best

def inpaint(img, hole, it=80):
    """4-neighbour diffusion into `hole`. Unknown cells start at 0."""
    acc = img.copy()
    known = ~hole
    if acc.ndim == 3:
        acc[hole] = 0
    else:
        acc = np.where(known, acc, 0)
    for _ in range(it):
        k = known.astype(np.float32)
        weight = k[..., None] if acc.ndim == 3 else k
        num = sum(np.roll(np.roll(acc * weight, dy, 0), dx, 1) for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)])
        den = sum(np.roll(np.roll(k, dy, 0), dx, 1) for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)])
        new = hole & ~known & (den > 0)
        if not new.any():
            break
        acc[new] = (num[new] / den[new][:, None]) if acc.ndim == 3 else num[new] / den[new]
        known = known | new
    return acc

def kmeans(X, w, keys, K):
    """OKLab k-means. `keys` stay fixed. Returns centres sorted by L, count ~= K-1."""
    nk = len(keys)
    rng = np.random.default_rng(1)
    C = np.vstack([keys, X[rng.choice(len(X), 1)]])
    extra = K - 2 - nk
    if extra < 0:
        raise SystemExit(f'K={K} is smaller than the {nk} key colours (need K >= {nk + 2})')
    for _ in range(extra):
        d2 = ((X[:, None] - C[None]) ** 2).sum(-1).min(1) * w
        C = np.vstack([C, X[rng.choice(len(X), p=d2 / d2.sum())]])
    for _ in range(40):
        lab = ((X[:, None] - C[None]) ** 2).sum(-1).argmin(1)
        for k in range(nk, len(C)):
            m = lab == k
            if m.any():
                C[k] = (X[m] * w[m, None]).sum(0) / w[m].sum()
    C = C[np.argsort(C[:, 0])]
    return np.clip(np.round(from_oklab(C / CH)), 0, 255)

def scene_dir_of(path):
    path = os.path.abspath(path)
    if os.path.isdir(path):
        return path
    raise SystemExit(f'not a scene directory: {path}')

def load_cfg(scene):
    p = os.path.join(scene, 'scene.json')
    if not os.path.exists(p):
        raise SystemExit(f'missing {p}')
    cfg = json.load(open(p))
    ref = cfg.get('reference', 'reference.jpg')
    if not os.path.isabs(ref):
        ref = os.path.join(scene, ref)
    if not os.path.exists(ref):
        raise SystemExit(f'missing reference image: {ref}')
    cfg['_ref_path'] = ref
    return cfg

def open_ref(cfg):
    im = Image.open(cfg['_ref_path']).convert('RGB')
    return im

def save_png(path, arr, mode):
    im = Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8), mode)
    im.save(path)
    return im

def write_manifest(out, scene, textures):
    os.makedirs(out, exist_ok=True)
    # textures: name -> (array, mode) already saved by caller, listed here as files
    manifest = dict(scene)
    manifest['textures'] = {k: k + '.png' for k in textures}
    # drop bulky nothing
    path = os.path.join(out, 'manifest.json')
    json.dump(manifest, open(path, 'w'), indent=1)
    print('wrote', path)

def poly_image(size, polys, blur=0, grow=0):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon([tuple(q) for q in p], fill=255)
    if grow:
        m = m.filter(ImageFilter.MaxFilter(2 * int(grow) + 1))
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return m

def down_image(im, G):
    if isinstance(im, np.ndarray):
        im = Image.fromarray(im.astype(np.float32), 'F')
    else:
        im = im.convert('F')
    return np.asarray(im.resize((G, G), Image.BOX)) / 255.0

def look_of(cfg):
    if 'look' in cfg:
        return dict(cfg['look'])
    if 'variants' in cfg:
        name = cfg.get('variant') or 'v3a'
        return dict(cfg['variants'][name])
    raise SystemExit('scene.json needs a "look" block (grid, K, kuwa, ...)')

def profile_of(cfg):
    if cfg.get('profile'):
        return cfg['profile']
    if 'cloth' in cfg:
        return 'laundry'
    if 'polygons' in cfg:
        return 'rain'
    raise SystemExit('scene.json needs "profile": "rain" or "laundry"')

# ---------------------------------------------------------------- rain
def prep_rain(cfg, scene):
    """Bus-stop profile. Matches the approved v3a prep, including its quirks."""
    lk = look_of(cfg)
    G, K = int(lk['grid']), int(lk['K'])
    out = os.path.join(scene, 'build')
    os.makedirs(out, exist_ok=True)
    src = open_ref(cfg)
    W, H = src.size
    S = W / G
    P = cfg['polygons']
    sat = float(lk.get('saturation', cfg.get('saturation', 1.0)))
    con = float(lk.get('contrast', cfg.get('contrast', 1.0)))
    LIFT, CHR = float(lk.get('lift', 1.0)), float(lk.get('chroma', 1.0))

    def poly(polys, blur=0):
        return poly_image((W, H), polys, blur, 0)

    def down(im):
        return down_image(im, G)

    if 'despeckle' in P:
        med = src.filter(ImageFilter.MedianFilter(5))
        src = Image.composite(med, src, poly(P['despeckle'], 2))
    a = np.asarray(src).astype(np.float32)
    passes, kuwa = int(lk.get('passes', 1)), int(lk.get('kuwa', 0))
    if kuwa > 0:
        for _ in range(passes):
            a = kuwahara(a, kuwa)

    ink = np.clip((255 - a.min(2) - 6) / 18.0, 0, 1)
    cov = down(Image.fromarray((ink * 255).astype(np.uint8)))
    num = [down(Image.fromarray((a[..., c] * ink).astype(np.float32), 'F')) for c in range(3)]
    rgb = np.clip(np.stack(num, -1) / np.maximum(cov[..., None], 1e-4) * 255.0, 0, 255)
    lum = (rgb @ LUMA)[..., None]
    rgb = np.clip(lum + (rgb - lum) * sat, 0, 255)
    rgb = np.clip((rgb - 128) * con + 128, 0, 255)
    rgb[cov < .02] = 255

    wet = down(poly(P['wet'], 2))
    detail = down(poly(P['detail'], 3))
    occl = down(poly(P['occluder'], 4))
    rain = down(poly(P['rainZone'], 40)) * (1 - occl) * (1 - .9 * detail)
    gl = np.asarray(poly(P['glow'], 14)).astype(np.float32) / 255
    yy, xx = np.mgrid[0:H, 0:W]
    for (cx, cy, r) in cfg.get('glowCenters', []):
        gl = np.maximum(gl, np.clip(1 - np.hypot(xx - cx, yy - cy) / (r * 1.4), 0, 1) ** 1.6)
    glow = down(Image.fromarray((gl * 255).astype(np.uint8)))
    umb = down(poly([P['umbrella']], 1))
    man = down(poly([P['man']], 1))
    yg = (np.arange(G)[:, None] + .5) * S
    manW = man * np.clip((cfg['manBreathBottom'] - yg) / (cfg['manBreathBottom'] - cfg['manBreathTop']), 0, 1)
    outlines = [P[k] for k in ('outline', 'outline2', 'outline3') if k in P]
    okeys = down(poly(outlines, 0)) if outlines else np.zeros((G, G))

    def clean(c):
        L = oklab(c)
        L[..., 0] = np.clip(L[..., 0], 0, 1) ** LIFT
        L[..., 1:] *= CHR
        return np.clip(from_oklab(L), 0, 255)
    if LIFT != 1 or CHR != 1:
        rgb = np.where(cov[..., None] < .02, 255., clean(rgb))
        a = clean(a.reshape(-1, 3)).reshape(a.shape).astype(np.float32)

    locked = cfg.get('palette')
    if locked:
        # Last three entries are paper white and the two rain tints.
        pal = np.array(locked[:-3], np.float32)
        pal_out = locked
    else:
        sel = cov > .5
        X = oklab(rgb[sel]) * CH
        w = cov[sel] * (1 + 8 * detail[sel] + 1.5 * glow[sel] + 1.5 * wet[sel])
        keys = []
        for (kx, ky) in cfg['keyColours']:
            patch = a[ky - 3:ky + 4, kx - 3:kx + 4].reshape(-1, 3)
            pk = np.median(patch, 0)
            pl = pk @ LUMA
            pk = np.clip(pl + (pk - pl) * sat, 0, 255)
            pk = np.clip((pk - 128) * con + 128, 0, 255)
            keys.append(oklab(pk[None])[0] * CH)
        pal = kmeans(X, w, np.array(keys), K)
        if lk.get('ink', 0):
            ink_col = np.array([[.17, 0.004, -0.012]]) * CH
            pal = np.vstack([np.clip(np.round(from_oklab(ink_col / CH)), 0, 255), pal])
        pal_out = pal.astype(int).tolist() + [[255, 255, 255], [214, 222, 232], [178, 192, 210]]
    if len(pal_out) > 24:
        raise SystemExit(f'palette has {len(pal_out)} entries; the shader holds 24 (lower K)')
    PL = oklab(pal) * CH

    Lc = oklab(rgb) * CH
    lbl = ((Lc[..., None, :] - PL[None, None]) ** 2).sum(-1).argmin(-1)
    lbl[cov < .5] = -1

    def mode_filter(l, keep):
        pad = np.pad(l, 1, mode='edge')
        n = len(pal)
        cnt = np.zeros(l.shape + (n + 1,), np.int16)
        for dy in range(3):
            for dx in range(3):
                v = pad[dy:dy + l.shape[0], dx:dx + l.shape[1]] + 1
                np.put_along_axis(cnt, v[..., None], np.take_along_axis(cnt, v[..., None], -1) + 1, -1)
        m = cnt.argmax(-1) - 1
        c = cnt.max(-1)
        return np.where(keep | (c < 4), l, m)
    for _ in range(int(lk.get('mode', 0))):
        lbl = mode_filter(lbl, detail > .6)
    flat = np.where(lbl[..., None] >= 0, pal[np.maximum(lbl, 0)], 255.).astype(np.float32)
    cov_flat = (lbl >= 0).astype(np.float32)

    Lp = np.where(lbl >= 0, PL[np.maximum(lbl, 0), 0], 1.05)
    outline = np.zeros((G, G), bool)
    for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
        nb = np.roll(np.roll(Lp, dy, 0), dx, 1)
        outline |= (nb - Lp > .16) & (lbl >= 0)
    outline &= okeys > .5
    outline &= Lp > .26
    ol = outline.astype(np.float32) * float(lk.get('outline', 0))

    hz = float(lk.get('haze', 0.3))
    PW = float(lk.get('posterize', 0))
    cont = np.where(lbl[..., None] >= 0, rgb, 255.).astype(np.float32)
    flat = cont * (1 - PW) + flat * PW
    cw = gblur(cov_flat, hz)
    soft = gblur(flat * cov_flat[..., None], hz) / np.maximum(cw[..., None], 1e-3)
    sharp = gblur(flat * cov_flat[..., None], hz * .35) / np.maximum(gblur(cov_flat, hz * .35)[..., None], 1e-3)
    base = soft * (1 - detail[..., None]) + sharp * detail[..., None]
    base = base * (1 - ol[..., None]) + pal[0] * ol[..., None]
    base[cw < .02] = 255
    covS = np.maximum(cov_flat, np.clip(gblur(cov_flat, float(lk.get('covBlur', 1))) * 1.1, 0, .6))
    covS = np.maximum(covS, ol)
    covBig = gblur(cov_flat, 6.0)

    hole = (umb > .05) | (man > .05)
    hole = np.roll(hole, 1, 0) | np.roll(hole, -1, 0) | hole
    fill = inpaint(base, hole, 60)
    fillCov = inpaint(covS, hole, 60)
    paper_y = float(lk.get('fillPaperY', cfg.get('fillPaperY', 395)))
    fillCov[(umb > .05) & (yg < paper_y)] = 0

    z = np.zeros((G, G))
    outs = {
        'base': (base, 'RGB'),
        'fill': (fill, 'RGB'),
        'mask': (np.stack([wet, rain, glow], -1) * 255, 'RGB'),
        'mask2': (np.stack([covS, detail, ol], -1) * 255, 'RGB'),
        'mask3': (np.stack([umb, manW, covBig], -1) * 255, 'RGB'),
        'mask4': (np.stack([fillCov, z, z], -1) * 255, 'RGB'),
    }
    for k, (v, md) in outs.items():
        save_png(os.path.join(out, k + '.png'), v, md)

    wy, wx = np.nonzero(wet > .85)
    r2 = np.random.default_rng(7)
    pts = [[float(wx[i]) + .5, float(wy[i]) + .5] for i in r2.choice(len(wx), 40, replace=False)]
    sc = lambda p: [p[0] / S, p[1] / S]
    manifest = dict(
        profile='rain', grid=G, loop=cfg['loopSeconds'], palette=pal_out,
        spread=float(lk.get('spread', 0.06)),
        drips=[sc(p) + [p[2] / S] for p in cfg['drips']],
        ripples=pts, pivot=sc(cfg['umbrellaPivot']), cellRef=S,
    )
    write_manifest(out, manifest, outs)
    Image.fromarray(np.array(pal_out, np.uint8)[None].repeat(24, 0).repeat(24, 1)).save(os.path.join(out, 'palette.png'))
    print('rain', 'grid', G, 'colours', len(pal_out), 'locked' if locked else 'k-means', 'S', round(S, 3))

# ---------------------------------------------------------------- laundry
def prep_laundry(cfg, scene):
    """Rooftop profile. Cloth warp, shadow sway, a breathing creature."""
    lk = look_of(cfg)
    G, K = int(lk['grid']), int(lk['K'])
    out = os.path.join(scene, 'build')
    os.makedirs(out, exist_ok=True)
    src = open_ref(cfg)
    W, H = src.size
    S = W / G
    sat, con = float(lk['saturation']), float(lk['contrast'])
    LIFT, CHR = float(lk['lift']), float(lk['chroma'])

    def poly(polys, blur=0, grow=0):
        return poly_image((W, H), polys, blur, grow)

    def down(im):
        return down_image(im, G)

    def grade(c):
        l = (c @ LUMA)[..., None]
        c = np.clip(l + (c - l) * sat, 0, 255)
        c = np.clip((c - 128) * con + 128, 0, 255)
        L = oklab(c)
        L[..., 0] = np.clip(L[..., 0], 0, 1) ** LIFT
        L[..., 1:] *= CHR
        return np.clip(from_oklab(L), 0, 255)

    a0 = np.asarray(src).astype(np.float32)
    kuwa = int(lk.get('kuwa', 0))
    a = kuwahara(a0, kuwa) if kuwa > 0 else a0
    passes = int(lk.get('passes', 1))
    for _ in range(max(0, passes - 1)):
        a = kuwahara(a, kuwa)
    ink = np.clip((255 - a.min(2) - 6) / 18.0, 0, 1)
    cov = down(ink * 255)
    rgb = np.clip(np.stack([down(a[..., c] * ink) for c in range(3)], -1) / np.maximum(cov[..., None], 1e-4) * 255, 0, 255)
    rgb = grade(rgb)
    rgb[cov < .02] = 255
    yg, xg = (np.mgrid[0:G, 0:G] + .5) * S

    still = np.asarray(poly([cfg['still']], grow=2)) > 127
    Lab0 = oklab(a0.reshape(-1, 3)).reshape(H, W, 3)
    chroma = np.hypot(Lab0[..., 1], Lab0[..., 2])
    hue_blue = Lab0[..., 2] < 0.012
    # Pale cloth, or a bluish cloth. A piece that shares a colour with the wall needs a hand mask
    # and, usually, a looser threshold (clothMinL / clothMaxChroma in look).
    min_l = float(lk.get('clothMinL', .62))
    max_c = float(lk.get('clothMaxChroma', .042))
    blue_c = float(lk.get('clothBlueChroma', .12))
    pale = (Lab0[..., 0] > min_l) & ((chroma < max_c) | (hue_blue & (chroma < blue_c))) & (ink > .3)
    pieces = cfg['cloth']
    cloth_ref = np.zeros((H, W), np.float32)
    behind = np.zeros((H, W), bool)
    for pc in pieces:
        pm = np.asarray(poly([pc['poly']])) > 127
        m = pm & pale & ~still
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3))) > 127
        cloth_ref = np.maximum(cloth_ref, m)
        if pc['name'] == 'sheet2':
            behind |= pm & still
    clothA = down(cloth_ref * 255)
    behindA = down(behind * 255.)
    pid = -np.ones((G, G), int)
    dist = np.full((G, G), 1e9)
    wf = np.zeros((G, G))
    sf = np.zeros((G, G))
    ampf = np.zeros((G, G))
    phf = np.zeros((G, G))
    for i, pc in enumerate(pieces):
        pm = down(poly([pc['poly']], grow=int(4 * S)))
        x0, y0, x1, y1 = pc['line']
        s = np.clip(((xg - x0) * (x1 - x0) + (yg - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2), -.2, 1.2)
        yl = y0 + (y1 - y0) * s
        w = np.clip((yg - yl) / pc['hem'], 0, 1.15)
        cx, cy = np.mean(np.array(pc['poly']), 0)
        dd = np.hypot(xg - cx, yg - cy)
        sel = (pm > .5) & (dd < dist)
        pid[sel] = i
        dist[sel] = dd[sel]
        wf[sel] = w[sel]
        sf[sel] = s[sel]
        ampf[sel] = pc['amp']
        phf[sel] = pc['phase']

    detail = down(poly([cfg['still'], cfg['cat']['poly']] + [p['poly'] for p in pieces[2:]], 2))
    locked = cfg.get('palette')
    if locked:
        pal_out = locked
    else:
        sel = cov > .5
        X = oklab(rgb[sel]) * CH
        wts = cov[sel] * (1 + 6 * detail[sel] + 1.5 * clothA[sel])
        keys = []
        for (kx, ky) in cfg['keyColours']:
            pk = np.median(a[ky - 3:ky + 4, kx - 3:kx + 4].reshape(-1, 3), 0)
            keys.append(oklab(grade(pk[None]))[0] * CH)
        pal = kmeans(X, wts, np.array(keys), K)
        pal_out = pal.astype(int).tolist() + [[255, 255, 255]]
    if len(pal_out) > 24:
        raise SystemExit(f'palette has {len(pal_out)} entries; the shader holds 24 (lower K)')

    cov_flat = (cov >= .5).astype(np.float32)
    cont = np.where(cov_flat[..., None] > 0, rgb, 255.)
    hz = float(lk.get('haze', 0.3))
    cw = gblur(cov_flat, hz)
    soft = gblur(cont * cov_flat[..., None], hz) / np.maximum(cw[..., None], 1e-3)
    sharp = gblur(cont * cov_flat[..., None], hz * .35) / np.maximum(gblur(cov_flat, hz * .35)[..., None], 1e-3)
    base = soft * (1 - detail[..., None]) + sharp * detail[..., None]
    base[cw < .02] = 255
    covS = np.maximum(cov_flat, np.clip(gblur(cov_flat, float(lk.get('covBlur', 1))) * 1.1, 0, .6))

    cl = clothA > .15
    acc = inpaint(np.where(cl[..., None], base, 0), ~cl, it=40)
    clothCol = np.where(cl[..., None], base, acc)
    clothAl = np.clip(np.maximum(clothA, (behindA > .2) * 1.0), 0, 1)
    clothAl[pid < 0] = 0

    cp = cfg['cat']
    catA = down(poly([cp['poly']], 1))
    earA = down(poly([cp['ear']], 1))
    catW = down(poly([cp['poly']], 1, grow=int(2 * S))) * np.clip((cp['bottom'] - yg) / (cp['bottom'] - cp['top']), 0, 1)
    earW = down(poly([cp['ear']], 1, grow=int(2 * S)))

    hole = (clothAl > .03) | (catA > .03) | ((down(poly([cfg['still']], grow=3)) > .03) & (pid >= 0))
    hole = hole | np.roll(hole, 1, 0) | np.roll(hole, -1, 0) | np.roll(hole, 1, 1) | np.roll(hole, -1, 1)
    fill = inpaint(base, hole, 200)
    fillCov = inpaint(covS, hole, 200)

    lum = base @ LUMA / 255
    stillA = down(poly([cfg['still']], 1, grow=int(1 * S)))
    zones = cfg.get('shadows', [])
    floor = down(poly([z['poly'] for z in zones], 2)) if zones else np.zeros((G, G))
    lit_sel = (floor > .5) & (clothAl < .05)
    litL = np.percentile(lum[lit_sel], 92) if lit_sel.any() else 1
    shade = np.clip(gblur(lum, 1.0) / litL, .35, 1.0)
    shade = np.where(shade > .93, 1., shade)
    excl = np.clip(clothAl * 3, 0, 1)
    shadowZ = gblur(floor, 1.0) * (1 - excl) * (1 - (catA > .05)) * (1 - (stillA > .05))
    sfield = np.zeros((G, G, 4))
    for zn in zones:
        pc = next(p for p in pieces if p['name'] == zn['piece'])
        zm = down(poly([zn['poly']], 2)) > .5
        x0, y0, x1, y1 = pc['line']
        s_ = np.clip(((xg - x0) * (x1 - x0) + (yg - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2), -.2, 1.2)
        sfield[zm] = np.stack([
            np.ones(zm.sum()) * zn.get('gain', .8),
            (s_[zm] + .2) / 1.4,
            np.ones(zm.sum()) * pc['amp'] / 4,
            np.ones(zm.sum()) * (pc['phase'] % 6.2832) / 6.2832,
        ], -1)

    z = np.zeros((G, G))
    outs = {
        'base': (base, 'RGB'),
        'fill': (fill, 'RGB'),
        'cloth': (np.dstack([clothCol * clothAl[..., None], clothAl * 255]), 'RGBA'),
        'cfield': (np.dstack([wf / 1.15, np.clip(sf + .2, 0, 1.4) / 1.4, ampf / 4, (phf % 6.2832) / 6.2832]) * 255, 'RGBA'),
        'mask': (np.dstack([covS, detail, fillCov, (pid >= 0) * 1.]) * 255, 'RGBA'),
        'mask2': (np.dstack([catA, catW, earA, earW]) * 255, 'RGBA'),
        'mask3': (np.dstack([shade, shadowZ, stillA, z + 1]) * 255, 'RGBA'),
        'sfield': (sfield * 255, 'RGBA'),
    }
    for k, (v, md) in outs.items():
        save_png(os.path.join(out, k + '.png'), v, md)
    sc = lambda p: [p[0] / S, p[1] / S]
    manifest = dict(
        profile='laundry', grid=G, loop=cfg['loopSeconds'], palette=pal_out,
        spread=float(lk.get('spread', 0.06)),
        motes=[sc(p) for p in cfg.get('motes', [])], cellRef=S,
    )
    write_manifest(out, manifest, outs)
    Image.fromarray(np.array(pal_out, np.uint8)[None].repeat(24, 0).repeat(24, 1)).save(os.path.join(out, 'palette.png'))
    print('laundry', 'grid', G, 'colours', len(pal_out), 'locked' if locked else 'k-means', 'cloth cells', int((clothA > .5).sum()), 'S', round(S, 3))

def cmd_prep(scene):
    cfg = load_cfg(scene)
    profile = profile_of(cfg)
    if profile == 'rain':
        prep_rain(cfg, scene)
    elif profile == 'laundry':
        prep_laundry(cfg, scene)
    else:
        raise SystemExit(f'unknown profile {profile}')

# ---------------------------------------------------------------- overlay / suggest
def _font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def _rings(cfg):
    """Yield (name, ring) for every hand polygon, so the overlay can label them."""
    P = cfg.get('polygons') or {}
    for name, rings in P.items():
        if not rings:
            continue
        if isinstance(rings[0][0], (int, float)):
            yield name, rings
        else:
            for i, ring in enumerate(rings):
                yield f'{name}{i}', ring
    for pc in cfg.get('cloth') or []:
        yield pc['name'], pc['poly']
        yield pc['name'] + ' line', [pc['line'][:2], pc['line'][2:]]
    if 'still' in cfg:
        yield 'still', cfg['still']
    if 'cat' in cfg:
        yield 'cat', cfg['cat']['poly']
        yield 'ear', cfg['cat']['ear']
    for zn in cfg.get('shadows') or []:
        yield 'shadow ' + zn['piece'], zn['poly']

def cmd_overlay(scene, step):
    cfg = load_cfg(scene)
    im = open_ref(cfg).convert('RGB')
    W, H = im.size
    overlay = im.copy()
    dr = ImageDraw.Draw(overlay, 'RGBA')
    # existing masks first, under the grid
    palette = [(220, 70, 90, 90), (50, 120, 210, 90), (40, 160, 90, 90),
               (230, 150, 30, 90), (140, 80, 200, 90), (20, 20, 20, 110)]
    font = _font(14)
    for i, (name, ring) in enumerate(_rings(cfg)):
        col = palette[i % len(palette)]
        pts = [tuple(p) for p in ring]
        if len(pts) >= 3:
            dr.polygon(pts, outline=col[:3] + (220,))
        elif len(pts) == 2:
            dr.line(pts, fill=col[:3] + (230,), width=2)
        for j, p in enumerate(pts):
            dr.ellipse((p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3), fill=col[:3] + (255,))
            dr.text((p[0] + 4, p[1] + 2), f'{name}:{j}', fill=(20, 20, 20, 255), font=font)
    # coordinate grid. Major lines every `step` reference pixels.
    grid = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    small = _font(11)
    for x in range(0, W + 1, step):
        gd.line([(x, 0), (x, H)], fill=(0, 0, 0, 70 if x % (step * 2) else 130), width=1)
        gd.text((x + 2, 2), str(x), fill=(0, 0, 0, 200), font=small)
    for y in range(0, H + 1, step):
        gd.line([(0, y), (W, y)], fill=(0, 0, 0, 70 if y % (step * 2) else 130), width=1)
        gd.text((2, y + 2), str(y), fill=(0, 0, 0, 200), font=small)
    out_im = Image.alpha_composite(overlay.convert('RGBA'), grid)
    dest = os.path.join(scene, 'overlay.png')
    out_im.convert('RGB').save(dest, quality=90)
    print('wrote', dest, f'grid every {step}px')

def _cc(mask):
    h, w = mask.shape
    seen = np.zeros((h, w), np.uint8)
    comps = []
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        stack = [(y, x)]
        seen[y, x] = 1
        pts = []
        while stack:
            cy, cx = stack.pop()
            pts.append((cx, cy))
            for ny, nx in ((cy, cx + 1), (cy, cx - 1), (cy + 1, cx), (cy - 1, cx)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = 1
                    stack.append((ny, nx))
        if len(pts) >= 10:
            comps.append(np.asarray(pts, np.float32))
    comps.sort(key=len, reverse=True)
    return comps

def _angle_poly(pts, bins=8):
    c = pts.mean(0)
    ang = np.arctan2(pts[:, 1] - c[1], pts[:, 0] - c[0])
    ring = []
    for b in range(bins):
        a0 = -np.pi + b * (2 * np.pi / bins)
        a1 = a0 + 2 * np.pi / bins
        sel = pts[(ang >= a0) & (ang < a1)]
        if len(sel) == 0:
            continue
        d = np.hypot(sel[:, 0] - c[0], sel[:, 1] - c[1])
        ring.append([float(sel[d.argmax(), 0]), float(sel[d.argmax(), 1])])
    return ring

def cmd_suggest(scene):
    """Colour and region guesses. A starting set of polygons, not a finished mask."""
    cfg = load_cfg(scene)
    im = open_ref(cfg)
    a0 = np.asarray(im).astype(np.float32)
    H, W = a0.shape[:2]
    Lab = oklab(a0.reshape(-1, 3)).reshape(H, W, 3)
    chroma = np.hypot(Lab[..., 1], Lab[..., 2])
    ink = np.clip((255 - a0.min(2) - 6) / 18.0, 0, 1)
    pale = (Lab[..., 0] > .62) & ((chroma < .042) | ((Lab[..., 2] < 0.012) & (chroma < .12))) & (ink > .3)
    # work on a coarse grid so the flood fill stays cheap
    step = max(4, W // 180)
    small = pale[::step, ::step]
    comps = _cc(small)
    cloth = []
    for pts in comps[:8]:
        ring = _angle_poly(pts, 8)
        cloth.append([[int(x * step + step / 2), int(y * step + step / 2)] for x, y in ring])
    # key-colour candidates: farthest-point colours on a box downsample
    G = 64
    small_rgb = np.asarray(im.resize((G, G), Image.BOX)).astype(np.float32)
    ink_s = np.clip((255 - small_rgb.min(2) - 6) / 18.0, 0, 1) > .4
    cols = small_rgb[ink_s]
    labs = oklab(cols) * CH
    ys, xs = np.nonzero(ink_s)
    if len(cols) == 0:
        keys = []
    else:
        rng = np.random.default_rng(1)
        pick = [int(rng.integers(len(cols)))]
        for _ in range(7):
            d2 = ((labs[:, None] - labs[pick][None]) ** 2).sum(-1).min(1)
            pick.append(int(d2.argmax()))
        keys = []
        for i in pick:
            keys.append({'at': [int((xs[i] + .5) * W / G), int((ys[i] + .5) * H / G)],
                         'rgb': [int(v) for v in cols[i]]})
    # dark blue lower region: a wet-ground guess
    lower = np.zeros_like(pale)
    lower[int(H * .55):, :] = True
    wet = lower & (Lab[..., 0] < .55) & (Lab[..., 2] < 0) & (ink > .25)
    wet_s = wet[::step, ::step]
    wet_rings = []
    for pts in _cc(wet_s)[:3]:
        ring = _angle_poly(pts, 6)
        wet_rings.append([[int(x * step + step / 2), int(y * step + step / 2)] for x, y in ring])

    suggestion = {
        'note': 'Guesses from colour. Trace them on overlay.png and replace the rings that miss the shape.',
        'keyColours': keys,
        'paleClothPolygons': cloth,
        'wetGuess': wet_rings,
    }
    dest = os.path.join(scene, 'suggest.json')
    json.dump(suggestion, open(dest, 'w'), indent=1)
    vis = im.convert('RGBA')
    pale_u8 = (pale * 90).astype(np.uint8)
    tint = Image.fromarray(np.dstack([
        np.full_like(pale_u8, 255), np.full_like(pale_u8, 255),
        np.full_like(pale_u8, 255), pale_u8]), 'RGBA')
    vis = Image.alpha_composite(vis, tint)
    dr = ImageDraw.Draw(vis, 'RGBA')
    font = _font(16)
    for ring in cloth:
        if len(ring) >= 3:
            dr.polygon([tuple(p) for p in ring], outline=(20, 90, 200, 255))
    for ring in wet_rings:
        if len(ring) >= 3:
            dr.polygon([tuple(p) for p in ring], outline=(20, 140, 160, 255))
    for k in keys:
        x, y = k['at']
        dr.rectangle((x - 6, y - 6, x + 6, y + 6), outline=(0, 0, 0, 255))
        dr.text((x + 8, y - 8), str(k['rgb']), fill=(0, 0, 0, 255), font=font)
    out_png = os.path.join(scene, 'suggest.png')
    vis.convert('RGB').save(out_png, quality=90)
    print('wrote', dest)
    print('wrote', out_png)
    print(f'pale cloth regions {len(cloth)}, wet guesses {len(wet_rings)}, key colours {len(keys)}')

# ---------------------------------------------------------------- present
def _ffmpeg(args):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr.decode() or 'ffmpeg failed\n')
        raise SystemExit(r.returncode)

def _font_big(size=22):
    return _font(size)

def metrics_of(mp4, grid):
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', mp4,
        '-vf', f'scale={grid}:{grid}:flags=neighbor',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
    ])
    fr = np.frombuffer(raw, np.uint8).reshape(-1, grid, grid, 3)
    if len(fr) < 2:
        raise SystemExit('mp4 decoded to fewer than 2 frames')
    d = np.abs(fr[1:].astype(np.int16) - fr[:-1].astype(np.int16)).sum(-1)
    ch = (d > 40).sum(axis=(1, 2)).astype(np.float64)
    seam = int((np.abs(fr[0].astype(np.int16) - fr[-1].astype(np.int16)).sum(-1) > 40).sum())
    cells = grid * grid
    med = float(np.median(ch))
    return {
        'frames': int(len(fr)),
        'grid': grid,
        'cells': cells,
        'medianCells': med,
        'meanCells': float(ch.mean()),
        'maxCells': float(ch.max()),
        'minCells': float(ch.min()),
        'p99Cells': float(np.percentile(ch, 99)),
        'medianPercent': med / cells * 100,
        'maxOverMedian': float(ch.max() / med) if med else None,
        'seamCells': seam,
        'seamPercent': seam / cells * 100,
        'seamWithinRange': bool(ch.min() * 0.5 <= seam <= ch.max() * 1.15 or seam <= med * 1.5),
    }

def _subject_center(cfg, grid, scale, W):
    S = W / grid
    pts = []
    if 'umbrellaPivot' in cfg:
        pts.append(cfg['umbrellaPivot'])
    P = cfg.get('polygons') or {}
    for key in ('umbrella', 'man'):
        if key in P and P[key] and isinstance(P[key][0][0], (int, float)):
            pts.extend(P[key])
    if 'still' in cfg:
        pts.extend(cfg['still'])
    if 'cat' in cfg:
        pts.extend(cfg['cat']['poly'])
    for pc in cfg.get('cloth') or []:
        pts.extend(pc['poly'])
    if not pts:
        return grid * scale / 2, grid * scale / 2
    arr = np.array(pts, np.float32)
    c = arr.mean(0)
    return float(c[0] / S * scale), float(c[1] / S * scale)

def cmd_present(scene):
    cfg = load_cfg(scene)
    man_path = os.path.join(scene, 'build', 'manifest.json')
    if not os.path.exists(man_path):
        raise SystemExit('run prep before present')
    manifest = json.load(open(man_path))
    out = os.path.join(scene, 'out')
    os.makedirs(out, exist_ok=True)
    mp4 = os.path.join(out, 'loop.mp4')
    if not os.path.exists(mp4):
        raise SystemExit(f'missing {mp4}')
    grid = int(manifest['grid'])
    scale = 4
    side = grid * scale
    # frames at 0,2,4,6,8,10s and four consecutive frames around t=3
    times = [0, 2, 4, 6, 8, 10, 3, 3 + 1 / 60, 3 + 2 / 60, 3 + 3 / 60]
    tmp = os.path.join(out, '_frames')
    os.makedirs(tmp, exist_ok=True)
    for i, t in enumerate(times):
        _ffmpeg(['-ss', f'{t:.5f}', '-i', mp4, '-frames:v', '1', os.path.join(tmp, f'{i:02d}.png')])
    frames = [Image.open(os.path.join(tmp, f'{i:02d}.png')).convert('RGB') for i in range(len(times))]
    for fr in frames:
        if fr.size != (side, side):
            fr.thumbnail((side, side))
    font = _font_big(22)
    # contact: 3x2 of the even seconds
    cell = side // 2
    contact = Image.new('RGB', (cell * 3, cell * 2), 'white')
    cd = ImageDraw.Draw(contact)
    for i, t in enumerate(times[:6]):
        thumb = frames[i].resize((cell, cell), Image.NEAREST)
        x, y = (i % 3) * cell, (i // 3) * cell
        contact.paste(thumb, (x, y))
        cd.text((x + 8, y + 8), f't={t:.0f}s', fill=(80, 80, 80), font=font)
    contact.save(os.path.join(out, 'contact.png'))
    # four consecutive frames, cropped on the subject and shown 1:1
    cx, cy = _subject_center(cfg, grid, scale, open_ref(cfg).size[0])
    win = int(side * 0.42)
    x0 = int(np.clip(cx - win / 2, 0, side - win))
    y0 = int(np.clip(cy - win / 2, 0, side - win))
    detail = Image.new('RGB', (win * 4, win), 'white')
    dd = ImageDraw.Draw(detail)
    for i, fr in enumerate(frames[6:]):
        crop = fr.crop((x0, y0, x0 + win, y0 + win))
        detail.paste(crop, (i * win, 0))
        dd.text((i * win + 8, 8), f'+{i}/60s', fill=(80, 80, 80), font=font)
    detail.save(os.path.join(out, 'contact_detail.png'))
    # compare: reference | frame at t=3
    ref = open_ref(cfg).resize((side, side), Image.LANCZOS)
    gap = 16
    comp = Image.new('RGB', (side * 2 + gap, side), 'white')
    comp.paste(ref, (0, 0))
    comp.paste(frames[6].resize((side, side), Image.NEAREST), (side + gap, 0))
    dr = ImageDraw.Draw(comp)
    dr.text((12, 12), 'reference', fill=(90, 90, 90), font=font)
    dr.text((side + gap + 12, 12), 'pocketworld  t=3s', fill=(90, 90, 90), font=font)
    comp.save(os.path.join(out, 'compare.png'))
    # gif: already-dithered pixels, no second dither. 20 fps keeps the file shareable.
    gif = os.path.join(out, 'loop.gif')
    _ffmpeg(['-i', mp4, '-vf',
             'fps=20,scale=520:520:flags=neighbor,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none',
             '-loop', '0', gif])
    m = metrics_of(mp4, grid)
    json.dump(m, open(os.path.join(out, 'metrics.json'), 'w'), indent=1)
    print(json.dumps(m, indent=1))
    for name in ('loop.mp4', 'loop.gif', 'compare.png', 'contact.png', 'contact_detail.png', 'metrics.json'):
        print('wrote', os.path.join(out, name))
    # drop the scratch frames
    for fn in os.listdir(tmp):
        os.remove(os.path.join(tmp, fn))
    os.rmdir(tmp)

def main():
    ap = argparse.ArgumentParser(description='pocketworld prep and scene helpers')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('prep', help='build mask textures and build/manifest.json')
    p.add_argument('scene')
    o = sub.add_parser('overlay', help='reference with a coordinate grid and the current polygons')
    o.add_argument('scene')
    o.add_argument('--step', type=int, default=64)
    s = sub.add_parser('suggest', help='guess key colours, pale cloth, and a wet region')
    s.add_argument('scene')
    r = sub.add_parser('present', help='gif, compare, contact sheet, smoothness metric from out/loop.mp4')
    r.add_argument('scene')
    m = sub.add_parser('metrics', help='smoothness / seam numbers for an mp4')
    m.add_argument('mp4')
    m.add_argument('--grid', type=int, default=260)
    args = ap.parse_args()
    if args.cmd == 'prep':
        cmd_prep(scene_dir_of(args.scene))
    elif args.cmd == 'overlay':
        cmd_overlay(scene_dir_of(args.scene), args.step)
    elif args.cmd == 'suggest':
        cmd_suggest(scene_dir_of(args.scene))
    elif args.cmd == 'present':
        cmd_present(scene_dir_of(args.scene))
    elif args.cmd == 'metrics':
        print(json.dumps(metrics_of(args.mp4, args.grid), indent=1))

if __name__ == '__main__':
    main()
