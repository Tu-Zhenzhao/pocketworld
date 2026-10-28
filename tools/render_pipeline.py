"""Shared frame cache, encoding, presentation and parity tools (no browser imports)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

import numpy as np
from PIL import Image, ImageDraw

from cpu_render import render_frame, load_textures
from pocketworld import load_cfg, open_ref, get_ffmpeg_path, _font, _rings_of, _subject_center, metrics_of

ROOT = Path(__file__).resolve().parent.parent


def digest(paths, extra=''):
    h = hashlib.sha256(extra.encode())
    for p in paths:
        h.update(str(Path(p).name).encode()); h.update(Path(p).read_bytes())
    return h.hexdigest()


def prep_digest(scene):
    cfg = load_cfg(str(scene))
    return digest([scene / 'scene.json', cfg['_ref_path'], ROOT / 'tools/pocketworld.py'])


def atomic_json(p, data):
    p = Path(p); tmp = p.with_suffix(p.suffix + '.tmp')
    tmp.write_text(json.dumps(data, indent=2) + '\n'); os.replace(tmp, p)


def plan(scene, backend='cpu', fps=60, scale=4, smoke=False, frames=None):
    scene = Path(scene).resolve()
    m = json.loads((scene / 'build/manifest.json').read_text())
    total = round(m['loop'] * fps)
    if fps <= 0 or scale <= 0 or total < 2:
        raise ValueError('fps/scale must be positive; loop must contain at least 2 frames')
    start, end = 0, min(total, 10) if smoke else total
    if frames:
        start, end = map(int, frames.split(':'))
        if not 0 <= start < end <= total: raise ValueError(f'--frames must satisfy 0 <= a < b <= {total}')
    inputs = [scene / 'scene.json', load_cfg(str(scene))['_ref_path'], scene / 'build/manifest.json', *[scene / 'build' / p for p in m['textures'].values()],
              ROOT / 'src/shaders.js', ROOT / 'src/player.js', ROOT / 'tools/cpu_render.py', Path(__file__)]
    key = digest(inputs, f'{backend}:{fps}:{scale}')
    cache = scene / 'build/frames' / key
    cache.mkdir(parents=True, exist_ok=True)
    ext = 'png' if backend == 'cpu' else 'rgba'
    missing = []
    for i in range(start, end):
        p = cache / f'frame_{i:05d}.{ext}'
        valid = False
        if p.exists():
            if ext == 'rgba': valid = p.stat().st_size == m['grid'] ** 2 * 4
            else:
                try:
                    with Image.open(p) as im:
                        valid = im.size == (m['grid'], m['grid']) and im.mode == 'RGB'
                        im.verify()
                except (OSError, ValueError): pass
        if not valid: missing.append(i)
    result = dict(scene=str(scene), backend=backend, fps=fps, scale=scale, total=total,
                  start=start, end=end, smoke=smoke, key=key, cache=str(cache), missing=missing, grid=m['grid'])
    atomic_json(scene / 'build/render-state.json', {**result, 'status': 'capturing'})
    return result


def frame_path(cache, i):
    return Path(cache) / f'frame_{i:05d}.png'


def encode(cache, total, fps, scale, dest):
    exe = get_ffmpeg_path()
    if not exe: return False
    cmd = [exe, '-v', 'error', '-y', '-framerate', str(fps), '-i', str(Path(cache) / 'frame_%05d.png'),
           '-frames:v', str(total), '-vf', f'scale=iw*{scale}:ih*{scale}:flags=neighbor',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-tune', 'animation',
           '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(dest / 'loop.mp4')]
    r = subprocess.run(cmd, capture_output=True, timeout=600)
    if r.returncode: raise RuntimeError('encode: ' + r.stderr.decode(errors='replace'))
    return True


def raw_metrics(cache, total, grid):
    first = np.asarray(Image.open(frame_path(cache, 0)).convert('RGB')).astype(np.int16)
    prev = first; changed = []
    for i in range(1, total):
        arr = np.asarray(Image.open(frame_path(cache, i)).convert('RGB')).astype(np.int16)
        changed.append(int((np.abs(arr - prev).sum(-1) > 40).sum())); prev = arr
    ch = np.asarray(changed, dtype=float); med = float(np.median(ch))
    seam = int((np.abs(first - prev).sum(-1) > 40).sum())
    return dict(frames=total, grid=grid, cells=grid*grid, medianCells=med, meanCells=float(ch.mean()),
                maxCells=float(ch.max()), minCells=float(ch.min()), p99Cells=float(np.percentile(ch, 99)),
                medianPercent=med / grid**2 * 100, maxOverMedian=float(ch.max()/med) if med else None,
                seamCells=seam, seamPercent=seam / grid**2 * 100,
                seamWithinRange=bool(ch.min()*.5 <= seam <= ch.max()*1.15 or seam <= med*1.5))


def present_frames(scene, cache, dest, total, fps=60, scale=4, video=True):
    cfg = load_cfg(str(scene)); m = json.loads((scene / 'build/manifest.json').read_text())
    grid=m['grid']; side=grid*scale; font=_font(18)
    def fr(t, full=True):
        i = min(total-1, max(0, round(t*fps)))
        with Image.open(frame_path(cache, i)) as im: result=im.convert('RGB')
        return result.resize((side, side), Image.Resampling.NEAREST) if full else result
    def strip(items, path):
        tiles=[]
        for label, im in items:
            tile=Image.new('RGB',(im.width, im.height+26),'white');tile.paste(im,(0,26))
            ImageDraw.Draw(tile).text((5,3),label,fill=(40,40,40),font=font);tiles.append(tile)
        sheet=Image.new('RGB',(sum(t.width for t in tiles)+8*(len(tiles)-1),max(t.height for t in tiles)),'white')
        x=0
        for tile in tiles:sheet.paste(tile,(x,0));x+=tile.width+8
        sheet.save(path)
    ref=open_ref(cfg).resize((side,side),Image.Resampling.LANCZOS)
    strip([('reference',ref),('pocketworld t=3s',fr(3))],dest/'compare.png')
    cell=side//2;contact=Image.new('RGB',(cell*3,cell*2),'white')
    for j,t in enumerate([0,2,4,6,8,10]):
        im=fr(t).resize((cell,cell),Image.Resampling.NEAREST);ImageDraw.Draw(im).text((8,8),f't={t}s',fill='grey',font=font)
        contact.paste(im,((j%3)*cell,(j//3)*cell))
    contact.save(dest/'contact.png')
    cx,cy=_subject_center(cfg,grid,scale,open_ref(cfg).width);win=int(side*.42)
    x0=int(np.clip(cx-win/2,0,side-win));y0=int(np.clip(cy-win/2,0,side-win))
    strip([(f'+{i}/{fps}s',fr(3+i/fps).crop((x0,y0,x0+win,y0+win))) for i in range(4)],dest/'contact_detail.png')
    strip([(f't={t}s',fr(t,False).resize((grid*2,grid*2),Image.Resampling.NEAREST)) for t in [0,3,6,9]],dest/'motion_phases.png')
    if m['profile']=='layers':
        W=open_ref(cfg).width;factor=side/W;loop=float(m['loop'])
        for L in cfg.get('layers',[]):
            kind=L['type']
            if not(kind=='rigid' or(kind=='soft' and L.get('preset','cloth')!='foliage')):continue
            pts=np.asarray(sum(_rings_of(L['poly']),[]),np.float32)
            if kind=='rigid':
                k=max(1,round(loop/float(L.get('period',4))));phase=float(L.get('phase',0))
                margin=float(np.hypot(*(pts-np.asarray(L['pivot'])).T).max())*abs(np.radians(L.get('amp',15)))+12
            else:k=3;phase=float(L.get('phase',0))/(2*np.pi);margin=12
            x0,y0=np.maximum((pts.min(0)-margin)*factor,0).astype(int)
            x1,y1=np.minimum((pts.max(0)+margin)*factor,side).astype(int)
            z=max(1,360/max(x1-x0,y1-y0));duty=float(L.get('duty',1)) if kind=='rigid' else 1
            items=[]
            for j in range(4):
                u=j/3*duty if duty<1 else j/4;t=((u-phase)%1)*loop/k
                im=fr(t).crop((x0,y0,x1,y1));im=im.resize((int(im.width*z),int(im.height*z)),Image.Resampling.NEAREST)
                items.append((f"{L.get('name',kind)} t={t:.2f}s",im))
            # Names are labels, never filesystem paths.
            name=''.join(c if c.isalnum() or c in '-_' else '_' for c in L.get('name',kind))
            strip(items,dest/f'{name}_phases.png')
    # GIF from source cells avoids a second dither or dependence on video decoding.
    step=max(1,round(fps/20));gif=[]
    for i in range(0,total,step):
        with Image.open(frame_path(cache,i)) as im:
            im=im.convert('RGB').resize((grid*2,grid*2),Image.Resampling.NEAREST)
            gif.append(im.quantize(colors=256,dither=Image.Dither.NONE))
    gif[0].save(dest/'loop.gif',save_all=True,append_images=gif[1:],duration=round(1000*step/fps),loop=0,disposal=2)
    met=metrics_of(str(dest/'loop.mp4'),grid) if video else raw_metrics(cache,total,grid)
    met['source']='decoded-mp4' if video else 'png-frames'
    atomic_json(dest/'metrics.json',met)


def finish(p):
    scene=Path(p['scene']);cache=Path(p['cache']);total=p['total'];G=p['grid']
    ext='png' if p['backend']=='cpu' else 'rgba'
    if p['smoke']:
        atomic_json(scene/'build/render-state.json',{**p,'status':'smoke-complete'})
        return dict(status='smoke-complete',cache=str(cache),frames=p['end']-p['start'])
    if not all((cache/f'frame_{i:05d}.{ext}').exists() for i in range(total)):
        atomic_json(scene/'build/render-state.json',{**p,'status':'partial'})
        return dict(status='partial',cache=str(cache),range=[p['start'],p['end']])
    if p['backend']=='browser':
        for i in range(total):
            a=np.fromfile(cache/f'frame_{i:05d}.rgba',dtype=np.uint8).reshape(G,G,4)[::-1,:,:3]
            Image.fromarray(a).save(frame_path(cache,i))
    stage=Path(tempfile.mkdtemp(prefix='.pocketworld-out-',dir=scene))
    started=time.monotonic()
    try:
        video=encode(cache,total,p['fps'],p['scale'],stage)
        if not video:print('WARNING: no ffmpeg; writing GIF + PNG frames + diagnostics (no MP4).',file=sys.stderr)
        present_frames(scene,cache,stage,total,p['fps'],p['scale'],video)
        artifacts={q.name:hashlib.sha256(q.read_bytes()).hexdigest() for q in stage.iterdir() if q.is_file()}
        result=dict(status='complete' if video else 'complete-gif-only',backend=p['backend'],inputHash=p['key'],
                    fps=p['fps'],frames=total,width=G*p['scale'],height=G*p['scale'],cache=str(cache),
                    artifacts=artifacts,encodingSeconds=round(time.monotonic()-started,3))
        atomic_json(stage/'render.json',result)
        out=scene/'out';out.mkdir(exist_ok=True)
        for q in stage.iterdir():
            if q.name!='render.json':os.replace(q,out/q.name)
        if not video:(out/'loop.mp4').unlink(missing_ok=True)
        os.replace(stage/'render.json',out/'render.json')
        atomic_json(scene/'build/render-state.json',{**p,**result})
        return result
    finally:shutil.rmtree(stage,ignore_errors=True)


def run_cpu(scene, frames=None, smoke=False, fps=60, scale=4):
    p=plan(scene,'cpu',fps,scale,smoke,frames);t0=time.monotonic()
    m=json.loads((Path(scene)/'build/manifest.json').read_text());tex=load_textures(str(scene),m)
    for n,i in enumerate(p['missing']):
        arr=render_frame(m,tex,i/fps);target=frame_path(p['cache'],i);tmp=target.with_suffix('.tmp')
        Image.fromarray(arr).save(tmp,format='PNG');os.replace(tmp,target)
        if n%60==0:print(f"cpu {i+1}/{p['total']} {time.monotonic()-t0:.1f}s",flush=True)
    elapsed=round(time.monotonic()-t0,3)
    print(f"CPU captured {len(p['missing'])} new frames in {elapsed}s",flush=True)
    result=finish(p);result['captureSeconds']=elapsed;result['newFrames']=len(p['missing'])
    atomic_json(Path(scene)/'build/last-run.json',result)
    print(json.dumps(result),flush=True)
    return result


def parity(scene, raw_dir, times, max_ratio=.0002):
    scene=Path(scene);dest=Path(raw_dir);m=json.loads((scene/'build/manifest.json').read_text());G=m['grid']
    tex=load_textures(str(scene),m);rows=[]
    for j,t in enumerate(times):
        a=render_frame(m,tex,t);b=np.fromfile(dest/f'browser-{j}.rgba',np.uint8).reshape(G,G,4)[::-1,:,:3]
        d=np.abs(a.astype(np.int16)-b.astype(np.int16));ratio=float(np.any(d>0,axis=-1).mean())
        rows.append(dict(time=t,differentPixels=int(np.any(d>0,axis=-1).sum()),differentRatio=ratio,
                         maxChannelDifference=int(d.max()),meanChannelDifference=float(d.mean()),pass_=ratio<=max_ratio))
        Image.fromarray(a).save(dest/f'cpu-{j}.png');Image.fromarray(b).save(dest/f'browser-{j}.png')
        Image.fromarray(np.minimum(d*8,255).astype(np.uint8)).save(dest/f'diff-{j}.png')
    report=dict(scene=scene.name,maxDifferentRatio=max_ratio,frames=rows,passed=all(r['pass_'] for r in rows))
    atomic_json(dest/'parity.json',report);print(json.dumps(report));return report


def main():
    ap=argparse.ArgumentParser();ap.add_argument('command',choices=['plan','finish','render','parity','prep-hash','frame'])
    ap.add_argument('scene');ap.add_argument('--backend',default='cpu');ap.add_argument('--frames');ap.add_argument('--smoke',action='store_true')
    ap.add_argument('--fps',type=int,default=60);ap.add_argument('--scale',type=int,default=4)
    ap.add_argument('--directory');ap.add_argument('--times',default='0,0.016666667,1.5,3,7.4,11.983333333')
    ap.add_argument('--max-ratio',type=float,default=.0002);ap.add_argument('--time',type=float,default=0)
    a=ap.parse_args();scene=Path(a.scene).resolve()
    if a.command=='prep-hash':print(prep_digest(scene))
    elif a.command=='plan':print(json.dumps(plan(scene,a.backend,a.fps,a.scale,a.smoke,a.frames)))
    elif a.command=='finish':print(json.dumps(finish(json.loads((scene/'build/render-state.json').read_text()))))
    elif a.command=='render':run_cpu(scene,a.frames,a.smoke,a.fps,a.scale)
    elif a.command=='parity':
        if not parity(scene,a.directory,[float(t) for t in a.times.split(',')],a.max_ratio)['passed']:sys.exit(1)
    elif a.command=='frame':
        m=json.loads((scene/'build/manifest.json').read_text());arr=render_frame(m,load_textures(str(scene),m),a.time)
        if not np.any(arr<200) or not np.any(arr>200):raise RuntimeError('CPU frame is blank/black')
        Image.fromarray(arr).save(a.directory)
        print(json.dumps(dict(grid=m['grid'],nonWhite=int(np.any(arr<250,axis=-1).sum()))))


if __name__=='__main__':
    try:main()
    except Exception as e:print(f'render: {e}',file=sys.stderr);sys.exit(1)
