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
    raise SystemExit('scene.json needs "profile": "layers", "rain" or "laundry"')

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

    erase_rings = _rings_of(cfg.get('erase') or cfg.get('inpaint'))
    if erase_rings:
        eraseA = down(poly(erase_rings, blur=1, grow=int(S))) > 0.05
        rgb = inpaint(rgb, eraseA, 160)
        cov = inpaint(cov, eraseA, 160)
        rgb[cov < .02] = 255

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

# ---------------------------------------------------------------- layers (generic)
LIGHT_MODES = {'breathe': 0, 'flicker': 1, 'glint': 2, 'shadow': 3}
PARTICLE_KINDS = {'rain': 0, 'snow': 1, 'leaves': 2, 'motes': 3, 'steam': 4}
PARTICLE_COLOUR = {'rain': [.80, .85, .92], 'snow': [.97, .97, .98], 'leaves': [.55, .62, .30],
                   'motes': [1., .97, .88], 'steam': [.93, .94, .95]}
PARTICLE_SIZE = {'rain': 1, 'snow': .7, 'leaves': .9, 'motes': .55, 'steam': 1}

def _rings_of(v):
    """A single ring or a list of rings -> list of rings."""
    if not v:
        return []
    return [v] if isinstance(v[0][0], (int, float)) else v

def prep_layers(cfg, scene):
    """Generic profile. Motion by physical category, see SKILL.md 'Motion layers'."""
    lk = look_of(cfg)
    G, K = int(lk['grid']), int(lk['K'])
    out = os.path.join(scene, 'build')
    os.makedirs(out, exist_ok=True)
    src = open_ref(cfg)
    W, H = src.size
    S = W / G
    loop = float(cfg.get('loopSeconds', 12))
    _lint_layers(cfg, lk, S)
    sat, con = float(lk.get('saturation', 1)), float(lk.get('contrast', 1))
    LIFT, CHR = float(lk.get('lift', 1)), float(lk.get('chroma', 1))
    poly = lambda rings, blur=0, grow=0: poly_image((W, H), _rings_of(rings), blur, grow)
    down = lambda im: down_image(im, G)

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
    a = a0
    for _ in range(int(lk.get('passes', 1)) if kuwa > 0 else 0):
        a = kuwahara(a, kuwa)
    ink = np.clip((255 - a.min(2) - 6) / 18.0, 0, 1)
    cov = down(ink * 255)
    rgb = np.clip(np.stack([down(a[..., c] * ink) for c in range(3)], -1) / np.maximum(cov[..., None], 1e-4) * 255, 0, 255)
    rgb = grade(rgb)
    rgb[cov < .02] = 255
    yg, xg = (np.mgrid[0:G, 0:G] + .5) * S

    erase_rings = _rings_of(cfg.get('erase') or cfg.get('inpaint'))
    if erase_rings:
        eraseA = down(poly(erase_rings, blur=1, grow=int(S))) > 0.05
        rgb = inpaint(rgb, eraseA, 160)
        cov = inpaint(cov, eraseA, 160)
        rgb[cov < .02] = 255

    layers = cfg.get('layers', [])
    by = lambda t: [L for L in layers if L['type'] == t]
    still_rings = _rings_of(cfg.get('still'))
    stillRef = (np.asarray(poly(still_rings, grow=2)) > 127) if still_rings else np.zeros((H, W), bool)
    stillA = down(poly(still_rings, 1, grow=int(S))) if still_rings else np.zeros((G, G))
    detail = down(poly(still_rings + _rings_of(cfg.get('detail')), 2)) if (still_rings or cfg.get('detail')) else np.zeros((G, G))

    locked = cfg.get('palette')
    if locked:
        pal_out = locked
    else:
        sel = cov > .5
        X = oklab(rgb[sel]) * CH
        keys = [oklab(grade(np.median(a[ky - 3:ky + 4, kx - 3:kx + 4].reshape(-1, 3), 0)[None]))[0] * CH
                for (kx, ky) in cfg.get('keyColours', [])]
        pal = kmeans(X, cov[sel] * (1 + 6 * detail[sel]), np.array(keys).reshape(-1, 3), K)
        pal_out = pal.astype(int).tolist() + [[255, 255, 255]]
    if len(pal_out) > 24:
        raise SystemExit(f'palette has {len(pal_out)} entries; the shader holds 24 (lower K)')

    cov_flat = (cov >= .5).astype(np.float32)
    cont = np.where(cov_flat[..., None] > 0, rgb, 255.)
    hz = float(lk.get('haze', 0.3))
    cw = gblur(cov_flat, hz)
    soft_c = gblur(cont * cov_flat[..., None], hz) / np.maximum(cw[..., None], 1e-3)
    sharp = gblur(cont * cov_flat[..., None], hz * .35) / np.maximum(gblur(cov_flat, hz * .35)[..., None], 1e-3)
    base = soft_c * (1 - detail[..., None]) + sharp * detail[..., None]
    base[cw < .02] = 255
    covS = np.maximum(cov_flat, np.clip(gblur(cov_flat, float(lk.get('covBlur', 1))) * 1.1, 0, .6))

    # 1. soft deform: a smooth weight field, warped in the shader. No cut-out, so no hole.
    soft = np.zeros((G, G, 4))
    soft2 = np.zeros((G, G, 4))
    best = np.zeros((G, G))
    for L in by('soft'):
        foliage = L.get('preset', 'cloth') == 'foliage'
        reg = down(poly(L['poly'], blur=float(L.get('feather', 3 * S)), grow=int(2 * S))) * (1 - stillA)
        x0, y0, x1, y1 = L['line']
        s_ = np.clip(((xg - x0) * (x1 - x0) + (yg - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2 + 1e-6), -.2, 1.2)
        w = np.clip((yg - (y0 + (y1 - y0) * s_)) / L['hem'], 0, 1.15) * reg
        sel = w > best
        best[sel] = w[sel]
        ang = float(L.get('dir', 166 if foliage else 153.4)) % 360
        soft[sel] = np.stack([w[sel] / 1.15, (s_[sel] + .2) / 1.4, np.full(sel.sum(), L['amp'] / 4),
                              np.full(sel.sum(), (L.get('phase', 0) % 6.2832) / 6.2832)], -1)
        soft2[sel, 0] = float(foliage)
        soft2[sel, 1] = ang / 360

    # 2 + 3. rigid and path parts: cut out by mask + ink, inpainted behind
    parts = by('rigid') + by('path')
    if len(parts) > 8:
        raise SystemExit('at most 8 rigid / path parts')
    names = [P.get('name', f'part{i}') for i, P in enumerate(parts)]
    pa = np.zeros((G, G, 8))
    mparts = []
    for i, P in enumerate(parts):
        pm = (np.asarray(poly(P['poly'])) > 127) & ~stillRef
        pa[..., i] = down(pm * ink * 255)
        par = P.get('parent')
        if par is not None and (par not in names or names.index(par) >= i):
            raise SystemExit(f'{names[i]}: parent {par} must be listed before it')
        k = max(1, round(loop / float(P.get('period', 4))))
        mp = dict(kind=P['type'], parent=names.index(par) if par else -1, k=k,
                  phase=float(P.get('phase', 0)))
        if P['type'] == 'rigid':
            mp.update(pivot=[P['pivot'][0] / S, P['pivot'][1] / S], amp=float(np.radians(P.get('amp', 15))),
                      bias=float(np.radians(P.get('bias', 0))), snap=float(P.get('snap', 0)),
                      duty=float(P.get('duty', 1.0)))
        else:
            mp.update(radius=list(P.get('radius', [4, 1])))
        mparts.append(mp)
    any_part = pa.max(-1)
    pin = any_part > .15
    partCol = np.where(pin[..., None], base, inpaint(np.where(pin[..., None], base, 0), ~pin, it=6))
    partCov = np.where(pin, covS, inpaint(np.where(pin, covS, 0), ~pin, it=6))
    hole = any_part > .03

    fill = inpaint(base, hole, 200) if hole.any() else base
    fillCov = inpaint(covS, hole, 200) if hole.any() else covS
    # a revealed hole is either clearly paper or clearly ground, never a speckled half-tone
    fillCov = np.where(hole, np.clip((fillCov - .35) / .3, 0, 1), fillCov)

    # 6. light
    lights = by('light')[:4]
    light = np.zeros((G, G, 4))
    mlights = []
    for i, L in enumerate(lights):
        light[..., i] = down(poly(L['poly'], blur=float(L.get('blur', 3 * S)))) * (1 - stillA * L.get('spareStill', 0))
        mode = LIGHT_MODES[L.get('mode', 'breathe')]
        mlights.append(dict(mode=mode, k=max(1, round(loop / float(L.get('period', 6)))),
                            amp=float(L.get('amp', .15 if mode < 3 else .12)), sway=float(L.get('sway', 0)),
                            color=list(L.get('color', [1, .86, .58]))))

    # 4. particles
    zone = np.zeros((G, G, 4))
    mpart = []
    for i, Q in enumerate(by('particles')[:4]):
        kind = Q.get('kind', 'motes')
        if kind == 'steam':
            ox, oy = Q['origin']
            zone[..., i] = 1
            origin = [ox / S, oy / S]
        else:
            zone[..., i] = down(poly(Q['zone'], blur=float(Q.get('blur', 8 * S))))
            origin = [0, 0]
        rep = 16 * max(1, round(float(Q.get('fall', 160)) / 16))
        mpart.append(dict(kind=PARTICLE_KINDS[kind], dens=float(Q.get('density', .4)),
                          size=float(Q.get('size', PARTICLE_SIZE[kind])), rep=rep,
                          color=list(Q.get('color', PARTICLE_COLOUR[kind])), origin=origin))

    # 5. surface waves
    waves = by('waves')
    wet = down(poly(sum([_rings_of(L['poly']) for L in waves], []), 2)) if waves else np.zeros((G, G))
    soft2[..., 2] = wet
    ripples = []
    if waves:
        wy, wx = np.nonzero(wet > .85)
        if len(wx):
            r2 = np.random.default_rng(7)
            ripples = [[float(wx[i]) + .5, float(wy[i]) + .5] for i in r2.choice(len(wx), 40, replace=len(wx) < 40)]
    wave = [float(max([L.get('shimmer', 1) for L in waves] or [0])), float(max([L.get('ripples', 1) for L in waves] or [0]))]

    outs = {
        'base': (base, 'RGB'),
        'fill': (fill, 'RGB'),
        'mask': (np.dstack([covS, detail, fillCov, hole * 1.]) * 255, 'RGBA'),
        'soft': (soft * 255, 'RGBA'),
        'soft2': (soft2 * 255, 'RGBA'),
        'part': (np.dstack([partCol, partCov * 255]), 'RGBA'),
        'pa0': (pa[..., :4] * 255, 'RGBA'),
        'pa1': (pa[..., 4:] * 255, 'RGBA'),
        'light': (light * 255, 'RGBA'),
        'zone': (zone * 255, 'RGBA'),
    }
    for k, (v, md) in outs.items():
        save_png(os.path.join(out, k + '.png'), v, md)
    manifest = dict(profile='layers', grid=G, loop=loop, palette=pal_out, spread=float(lk.get('spread', 0.06)),
                    parts=mparts, lights=mlights, particles=mpart, wave=wave, ripples=ripples, cellRef=S)
    write_manifest(out, manifest, outs)
    Image.fromarray(np.array(pal_out, np.uint8)[None].repeat(24, 0).repeat(24, 1)).save(os.path.join(out, 'palette.png'))
    print('layers', 'grid', G, 'colours', len(pal_out), 'locked' if locked else 'k-means',
          'soft', len(by('soft')), 'parts', len(parts), 'lights', len(lights), 'particles', len(mpart),
          *(['erase', len(erase_rings)] if erase_rings else []), 'S', round(S, 3))
    parts_sheet(cfg, scene, src, ink, stillRef, S)

def _lint_layers(cfg, lk, S):
    """Guardrails. Clamp a too-vivid look; warn about motion that will not read."""
    for k in ('saturation', 'chroma'):
        if float(lk.get(k, 1)) > 1.0:
            print(f'WARNING look.{k} {lk[k]} > 1.0: clamped to 1.0 (layers wants a refined, low-saturation palette, 0.9-1.0)')
            lk[k] = 1.0
    erase_rings = _rings_of(cfg.get('erase') or cfg.get('inpaint'))
    if erase_rings:
        print(f"erase: {len(erase_rings)} polygon(s) inpainted in base and coverage")
    for i, r in enumerate(_rings_of(cfg.get('still'))):
        a = np.asarray(r, np.float32)
        area = (a[:, 0].max() - a[:, 0].min()) * (a[:, 1].max() - a[:, 1].min())
        if area > 90 * 90:
            print(f'WARNING still{i} is {int(area)} px^2: still is for eyes, facial detail, small precise things. '
                  'A whole figure in still never breathes; give it a breath layer instead.')
    for L in cfg.get('layers', []):
        if L['type'] != 'rigid':
            continue
        pts = np.asarray(sum(_rings_of(L['poly']), []), np.float32)
        r = float(np.hypot(*(pts - np.asarray(L['pivot'], np.float32)).T).max())
        sweep = abs(np.radians(float(L.get('amp', 15)))) * r / S
        duty_str = f", duty {L['duty']}" if 'duty' in L else ""
        print(f"rigid {L.get('name', '?')}: amp {L.get('amp', 15)} deg, reach {r:.0f} px, sweep {sweep:.2f} cells at the tip{duty_str}")

PART_COLS = {'rigid': (220, 60, 60), 'path': (60, 120, 220), 'soft': (40, 150, 80),
             'light': (210, 150, 30), 'particles': (140, 80, 200)}

def parts_sheet(cfg, scene, src, ink, stillRef, S):
    """build/parts.png: every moving layer's cut-out (poly ∩ ink, minus still) on grey, zoomed,
    with its pivot, plus a thumbnail of where the poly sits. Check that each tile IS the named object."""
    ref = np.asarray(src).astype(np.float32)
    W, H = src.size
    TILE, TH, PAD = 300, 120, 10
    font, small = _font(16), _font(12)
    cards = []
    for i, L in enumerate(cfg.get('layers', [])):
        t = L['type']
        if t == 'waves':
            continue
        rings = _rings_of(L.get('poly') or L.get('zone'))
        nm = L.get('name', f'{t}{i}')
        if not rings:  # steam: origin only
            ox, oy = L['origin']
            rings = [[[ox - 24, oy - 48], [ox + 24, oy - 48], [ox + 24, oy + 8], [ox - 24, oy + 8]]]
        pm = np.asarray(poly_image((W, H), rings)) > 127
        cut = pm & ~stillRef
        if t in ('rigid', 'path', 'soft'):
            cut &= ink > .3
        pts = np.asarray(sum(rings, []), np.float32)
        extra = [L[k] for k in ('pivot', 'origin') if k in L]
        if 'line' in L:
            extra += [L['line'][:2], L['line'][2:]]
        allp = np.vstack([pts] + ([np.asarray(extra, np.float32)] if extra else []))
        x0, y0 = np.floor(allp.min(0)) - 8
        x1, y1 = np.ceil(allp.max(0)) + 8
        x0, y0, x1, y1 = int(max(0, x0)), int(max(0, y0)), int(min(W, x1)), int(min(H, y1))
        crop = np.where(cut[y0:y1, x0:x1, None], ref[y0:y1, x0:x1], np.array([150., 150, 150]))
        z = min(TILE / (x1 - x0), TILE / (y1 - y0), 6.0)
        tw, th_ = max(1, int((x1 - x0) * z)), max(1, int((y1 - y0) * z))
        tile = Image.new('RGB', (TILE, TILE), (150, 150, 150))
        tile.paste(Image.fromarray(crop.astype(np.uint8)).resize((tw, th_), Image.NEAREST), (0, 0))
        td = ImageDraw.Draw(tile)
        mp = lambda p: ((p[0] - x0) * z, (p[1] - y0) * z)
        for r in rings:
            td.polygon([mp(p) for p in r], outline=(255, 255, 255))
        if 'line' in L:
            td.line([mp(L['line'][:2]), mp(L['line'][2:])], fill=(40, 150, 80), width=2)
        for k in ('pivot', 'origin'):
            if k in L:
                cx, cy = mp(L[k])
                td.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=(255, 30, 30), outline=(255, 255, 255), width=2)
        # thumbnail: whole reference, this poly outlined
        th = src.resize((TH, TH), Image.BILINEAR)
        thd = ImageDraw.Draw(th)
        for r in rings:
            thd.polygon([(p[0] * TH / W, p[1] * TH / H) for p in r], outline=PART_COLS[t], width=2)
        card = Image.new('RGB', (TILE + TH + 3 * PAD, TILE + 2 * PAD), 'white')
        card.paste(tile, (PAD, PAD))
        card.paste(th, (TILE + 2 * PAD, PAD))
        cd = ImageDraw.Draw(card)
        cd.text((TILE + 2 * PAD, TH + 2 * PAD), nm, fill=PART_COLS[t], font=font)
        info = [t + (f" ({L.get('kind') or L.get('mode') or L.get('preset', '')})" if t != 'rigid' else '')]
        if t == 'rigid':
            info += [f"amp {L.get('amp', 15)} deg", f"pivot {L['pivot']}"] + ([f"duty {L['duty']}"] if 'duty' in L else []) + ([f"parent {L['parent']}"] if L.get('parent') else [])
        elif t == 'soft':
            info += [f"amp {L.get('amp')} cells", f"hem {L.get('hem')}"]
        info += [f'x {x0}-{x1}', f'y {y0}-{y1}', f'zoom x{z:.1f}']
        for j, line in enumerate(info):
            cd.text((TILE + 2 * PAD, TH + 2 * PAD + 22 + 16 * j), line, fill=(60, 60, 60), font=small)
        cards.append(card)
    dest = os.path.join(scene, 'build', 'parts.png')
    if not cards:
        return
    cols = 2 if len(cards) > 1 else 1
    cw, ch = cards[0].size
    rows = (len(cards) + cols - 1) // cols
    head = 34
    sheet = Image.new('RGB', (cw * cols, ch * rows + head), 'white')
    ImageDraw.Draw(sheet).text((PAD, 8), 'parts: each tile must BE the named object (grey = not moving, red dot = pivot)',
                               fill=(30, 30, 30), font=font)
    for i, c in enumerate(cards):
        sheet.paste(c, ((i % cols) * cw, head + (i // cols) * ch))
    sheet.save(dest)
    print('wrote', dest, '<- open it: each tile must be the object it is named after')

def cmd_prep(scene):
    cfg = load_cfg(scene)
    profile = profile_of(cfg)
    if profile == 'rain':
        prep_rain(cfg, scene)
    elif profile == 'laundry':
        prep_laundry(cfg, scene)
    elif profile == 'layers':
        prep_layers(cfg, scene)
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
    if 'still' in cfg and cfg.get('profile') != 'layers':
        yield 'still', cfg['still']
    if 'cat' in cfg:
        yield 'cat', cfg['cat']['poly']
        yield 'ear', cfg['cat']['ear']
    for zn in cfg.get('shadows') or []:
        yield 'shadow ' + zn['piece'], zn['poly']
    if cfg.get('profile') == 'layers':
        for i, r in enumerate(_rings_of(cfg.get('erase') or cfg.get('inpaint'))):
            yield f'erase{i}', r
        for i, r in enumerate(_rings_of(cfg.get('still'))):
            yield f'still{i}', r
        for L in cfg.get('layers') or []:
            nm = L.get('name', L['type'])
            for r in _rings_of(L.get('poly') or L.get('zone')):
                yield nm, r
            if 'line' in L:
                yield nm + ' line', [L['line'][:2], L['line'][2:]]
            for key in ('pivot', 'origin'):
                if key in L:
                    yield f'{nm} {key}', [L[key]]

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
    if cfg.get('profile') == 'layers':
        for L in cfg.get('layers') or []:
            if L['type'] in ('rigid', 'path'):
                pts.extend(sum(_rings_of(L['poly']), []))
    elif 'still' in cfg:
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

def cmd_phases(scene):
    """out/<name>_phases.png: each rigid part (and each cloth/breath soft part) at 4 phases of its
    stroke, cropped from out/loop.mp4. Open it: the motion must read as the intended action."""
    cfg = load_cfg(scene)
    if cfg.get('profile') != 'layers':
        return
    out = os.path.join(scene, 'out')
    mp4 = os.path.join(out, 'loop.mp4')
    if not os.path.exists(mp4):
        raise SystemExit(f'missing {mp4}: render first')
    grid = int(json.load(open(os.path.join(scene, 'build', 'manifest.json')))['grid'])
    W = open_ref(cfg).size[0]
    loop = float(cfg.get('loopSeconds', 12))
    f = 4 * grid / W  # reference px -> mp4 px
    font = _font(16)
    for L in cfg.get('layers', []):
        t = L['type']
        if not (t == 'rigid' or (t == 'soft' and L.get('preset', 'cloth') != 'foliage')):
            continue
        nm = L.get('name', t)
        pts = np.asarray(sum(_rings_of(L['poly']), []), np.float32)
        if t == 'rigid':
            k = max(1, round(loop / float(L.get('period', 4))))
            ph0 = float(L.get('phase', 0))
            r = float(np.hypot(*(pts - np.asarray(L['pivot'], np.float32)).T).max())
            m = r * abs(np.radians(float(L.get('amp', 15)))) + 12
        else:
            k, ph0, m = 3, float(L.get('phase', 0)) / (2 * np.pi), 12
        x0, y0 = (pts.min(0) - m) * f
        x1, y1 = (pts.max(0) + m) * f
        side = 4 * grid
        x0, y0, x1, y1 = int(max(0, x0)), int(max(0, y0)), int(min(side, x1)), int(min(side, y1))
        z = max(1.0, 360 / max(x1 - x0, y1 - y0))
        tiles = []
        duty = float(L.get('duty', 1.0)) if t == 'rigid' else 1.0
        for j in range(4):
            u_rel = (j / 3.0) * duty if duty < 1.0 else j / 4.0
            tt = ((u_rel - ph0) % 1) * loop / k
            fn = os.path.join(out, f'_ph{j}.png')
            _ffmpeg(['-ss', f'{tt:.4f}', '-i', mp4, '-frames:v', '1', fn])
            fr = Image.open(fn).convert('RGB').crop((x0, y0, x1, y1))
            os.remove(fn)
            fr = fr.resize((int(fr.width * z), int(fr.height * z)), Image.NEAREST)
            tl = Image.new('RGB', (fr.width, fr.height + 24), 'white')
            tl.paste(fr, (0, 24))
            ImageDraw.Draw(tl).text((4, 3), f'{nm} {j}/4  t={tt:.2f}s', fill=(40, 40, 40), font=font)
            tiles.append(tl)
        strip = Image.new('RGB', (sum(x.width for x in tiles) + 8 * 3, tiles[0].height), 'white')
        x = 0
        for tl in tiles:
            strip.paste(tl, (x, 0))
            x += tl.width + 8
        dest = os.path.join(out, f'{nm}_phases.png')
        strip.save(dest)
        print('wrote', dest)

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
    cmd_phases(scene)
    # drop the scratch frames
    for fn in os.listdir(tmp):
        os.remove(os.path.join(tmp, fn))
    os.rmdir(tmp)

def cmd_check_ref(target):
    if os.path.isdir(target):
        scene_json = os.path.join(target, 'scene.json')
        if os.path.isfile(scene_json):
            try:
                cfg = json.load(open(scene_json))
                ref_name = cfg.get('reference', 'reference.jpg')
            except Exception:
                ref_name = 'reference.jpg'
            img_path = os.path.join(target, ref_name)
        else:
            candidates = [os.path.join(target, 'reference.jpg'), os.path.join(target, 'reference.png'), os.path.join(target, 'reference.jpeg')]
            found = [c for c in candidates if os.path.isfile(c)]
            if found:
                img_path = found[0]
            else:
                raise SystemExit(f'check-ref: no reference image found in directory {target}')
    elif os.path.isfile(target):
        img_path = target
    else:
        raise SystemExit(f'check-ref: target not found: {target}')

    try:
        img = Image.open(img_path).convert('RGB')
    except Exception as e:
        raise SystemExit(f'check-ref: cannot open {img_path}: {e}')

    w, h = img.size
    warnings = []

    # 1. Square & resolution
    if w != h:
        warnings.append(f'Non-square aspect ratio: {w}x{h}. Pocketworld reference images must be 1:1 square (ideal: 1024x1024).')
    elif w < 512 or h < 512:
        warnings.append(f'Low resolution: {w}x{h}. Recommended resolution is 1024x1024.')

    arr = np.array(img, dtype=np.float32) / 255.0

    # 2. Clean white background & margin isolation
    cw = min(32, w // 8)
    ch = min(32, h // 8)
    corners = np.concatenate([
        arr[:ch, :cw].reshape(-1, 3),
        arr[:ch, -cw:].reshape(-1, 3),
        arr[-ch:, :cw].reshape(-1, 3),
        arr[-ch:, -cw:].reshape(-1, 3)
    ], axis=0)
    corner_mean = corners.mean()
    if corner_mean < 0.92:
        warnings.append(
            f'Background is not clean white (margin mean brightness: {corner_mean*255:.1f}/255). '
            'Diorama island must float on a clean white page (#FFFFFF) with wide empty margins.'
        )

    border_pixels = np.concatenate([
        arr[:2, :].reshape(-1, 3),
        arr[-2:, :].reshape(-1, 3),
        arr[:, :2].reshape(-1, 3),
        arr[:, -2:].reshape(-1, 3)
    ], axis=0)
    border_dark = (border_pixels.max(axis=-1) < 0.90).sum()
    if border_dark > (border_pixels.shape[0] * 0.05):
        warnings.append(
            'Subject appears cropped or touching canvas boundaries. '
            'Leave a generous empty white margin around the diorama island.'
        )

    # 3. Saturation check
    mx = arr.max(axis=-1)
    mn = arr.min(axis=-1)
    diff = mx - mn
    sat = np.where(mx > 0.05, diff / np.maximum(mx, 1e-5), 0)
    is_white = (arr > 0.95).all(axis=-1)
    non_white = ~is_white
    if non_white.sum() > 0:
        mean_sat = sat[non_white].mean()
        p95_sat = float(np.percentile(sat[non_white], 95))
        if mean_sat > 0.50 or p95_sat > 0.95:
            warnings.append(
                f'Palette saturation is high (mean sat: {mean_sat:.2f}, 95th pct: {p95_sat:.2f}). '
                'Pocketworld scenes require low-saturation, refined watercolor tones (avoid candy/neon colors).'
            )
    else:
        warnings.append('Image appears almost completely blank/white.')

    # 4. Darkness check
    lum = (arr @ LUMA).mean()
    if lum < 0.55:
        warnings.append(
            f'Image appears too dark overall (average luminance: {lum*255:.1f}/255). '
            'Ensure the diorama island is well-lit and placed on a white page.'
        )

    print(f'Checking reference: {img_path} ({w}x{h})')
    if warnings:
        print(f'[WARN] Found {len(warnings)} potential issue(s):')
        for i, w_msg in enumerate(warnings, 1):
            print(f'  {i}. {w_msg}')
        print('Recommendation: Review skills/pocketworld/reference_prompt.md or generate a new still.')
    else:
        print('[OK] Reference image passes all checks: 1:1 square, clean white background margins, refined low saturation, balanced luminance.')

def main():
    ap = argparse.ArgumentParser(description='pocketworld prep and scene helpers')
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('prep', help='build mask textures and build/manifest.json')
    p.add_argument('scene')
    cr = sub.add_parser('check-ref', help='validate reference image meets pocketworld standards')
    cr.add_argument('target', help='path to reference image file or scene directory')
    o = sub.add_parser('overlay', help='reference with a coordinate grid and the current polygons')
    o.add_argument('scene')
    o.add_argument('--step', type=int, default=64)
    s = sub.add_parser('suggest', help='guess key colours, pale cloth, and a wet region')
    s.add_argument('scene')
    r = sub.add_parser('present', help='gif, compare, contact sheet, smoothness metric from out/loop.mp4')
    r.add_argument('scene')
    ph = sub.add_parser('phases', help='out/<part>_phases.png: each rigid / breath part at 4 phases')
    ph.add_argument('scene')
    m = sub.add_parser('metrics', help='smoothness / seam numbers for an mp4')
    m.add_argument('mp4')
    m.add_argument('--grid', type=int, default=260)
    args = ap.parse_args()
    if args.cmd == 'prep':
        cmd_prep(scene_dir_of(args.scene))
    elif args.cmd == 'check-ref':
        cmd_check_ref(args.target)
    elif args.cmd == 'overlay':
        cmd_overlay(scene_dir_of(args.scene), args.step)
    elif args.cmd == 'suggest':
        cmd_suggest(scene_dir_of(args.scene))
    elif args.cmd == 'present':
        cmd_present(scene_dir_of(args.scene))
    elif args.cmd == 'phases':
        cmd_phases(scene_dir_of(args.scene))
    elif args.cmd == 'metrics':
        print(json.dumps(metrics_of(args.mp4, args.grid), indent=1))

if __name__ == '__main__':
    main()
