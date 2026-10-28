"""Extra parity scene covering categories absent from the approved examples."""
import json
from pathlib import Path
import shutil
import sys
root=Path(__file__).resolve().parents[1];dest=Path(sys.argv[1]);dest.mkdir(parents=True,exist_ok=True)
src=root/'examples/chess-under-tree';cfg=json.loads((src/'scene.json').read_text())
shutil.copy2(src/'reference.jpg',dest/'reference.jpg')
# Exercise path, generic rain, steam and all light modes in addition to the five real scenes.
rect=[[200,200],[800,200],[800,800],[200,800]]
cfg['layers'] += [dict(type='path',name='path',poly=[[350,600],[380,600],[380,630],[350,630]],radius=[3,1],period=4,phase=.3),
 dict(type='particles',name='rain',kind='rain',zone=rect,density=.4),
 dict(type='particles',name='snow',kind='snow',zone=rect,density=.4),
 dict(type='particles',name='steam',kind='steam',origin=[520,550]),
 dict(type='light',name='breathe',mode='breathe',poly=rect,amp=.1,period=6),
 dict(type='light',name='flicker',mode='flicker',poly=rect,amp=.1,period=3),
 dict(type='light',name='glint',mode='glint',poly=rect,amp=.1,period=4)]
(dest/'scene.json').write_text(json.dumps(cfg))
print(dest)
