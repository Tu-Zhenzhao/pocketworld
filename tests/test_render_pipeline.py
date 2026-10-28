"""Failure, cache invalidation and browser-free delivery contracts."""
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import render_pipeline as rp

ROOT=Path(__file__).resolve().parents[1]


class PipelineContracts(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.scene=Path(self.tmp.name)/'scene';self.scene.mkdir()
        src=ROOT/'examples/rain-bus-stop'
        for f in ['scene.json','reference.jpg']:shutil.copy2(src/f,self.scene/f)
        shutil.copytree(src/'build',self.scene/'build',ignore=shutil.ignore_patterns('frames','parity','*state.json','last-run.json'))
        # A small actual rain scene (all textures resized together) keeps fault tests quick.
        m=json.loads((self.scene/'build/manifest.json').read_text());m['grid']=32;m['loop']=.1
        (self.scene/'build/manifest.json').write_text(json.dumps(m))
        for f in m['textures'].values():
            with Image.open(self.scene/'build'/f) as im:im.resize((32,32)).save(self.scene/'build'/f)

    def tearDown(self):self.tmp.cleanup()

    def test_smoke_never_publishes_old_outputs_and_invalidates_cache(self):
        out=self.scene/'out';out.mkdir();(out/'loop.mp4').write_bytes(b'previous successful video')
        with contextlib.redirect_stdout(io.StringIO()):rp.run_cpu(self.scene,smoke=True)
        self.assertEqual((out/'loop.mp4').read_bytes(),b'previous successful video')
        first=rp.plan(self.scene,smoke=True)
        self.assertEqual(first['missing'],[])
        p=self.scene/'build/base.png'
        with Image.open(p) as im:
            a=np.array(im);a[0,0]=0;Image.fromarray(a).save(p)
        changed=rp.plan(self.scene,smoke=True)
        self.assertNotEqual(first['key'],changed['key']);self.assertEqual(len(changed['missing']),6)

    def test_pillow_fallback_is_complete_and_removes_stale_mp4(self):
        out=self.scene/'out';out.mkdir();(out/'loop.mp4').write_bytes(b'old')
        with patch.object(rp,'get_ffmpeg_path',return_value=None), contextlib.redirect_stdout(io.StringIO()):
            result=rp.run_cpu(self.scene)
        self.assertEqual(result['status'],'complete-gif-only');self.assertFalse((out/'loop.mp4').exists())
        for f in ['loop.gif','compare.png','contact.png','contact_detail.png','motion_phases.png','metrics.json','render.json']:
            self.assertTrue((out/f).is_file(),f)
        self.assertEqual(json.loads((out/'metrics.json').read_text())['source'],'png-frames')

    def test_encoder_failure_is_non_success_and_keeps_old_output(self):
        out=self.scene/'out';out.mkdir();(out/'loop.mp4').write_bytes(b'old')
        with patch.object(rp,'get_ffmpeg_path',return_value='/usr/bin/false'), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError,'encode:'):rp.run_cpu(self.scene)
        self.assertEqual((out/'loop.mp4').read_bytes(),b'old')
        self.assertFalse((out/'render.json').exists());self.assertEqual(list(self.scene.glob('.pocketworld-out-*')),[])

    def test_bad_range_does_not_render(self):
        with self.assertRaisesRegex(ValueError,'--frames'):rp.plan(self.scene,frames='5:2')


if __name__=='__main__':unittest.main()
