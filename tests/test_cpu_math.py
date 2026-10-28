"""Regression samples captured from WebGL2/SwiftShader, plus texture conventions."""
import sys
from pathlib import Path
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import cpu_render as cpu


class ShaderMath(unittest.TestCase):
    def test_hash_matches_software_webgl(self):
        # libm/numpy sin gives .3203125 here; shader sin gives .25.
        self.assertEqual(float(cpu.hash_xy(1,0)),.25)
        self.assertEqual(float(cpu.hash_xy(0,1)),.24609375)
        self.assertEqual(float(cpu.hash1(1)),.150390625)

    def test_bilinear_centers_and_clamp(self):
        tex=np.arange(4,dtype=np.float32).reshape(2,2,1)
        x=np.array([[.5,1.,-2,4]],np.float32);y=np.array([[.5,1.,-2,4]],np.float32)
        np.testing.assert_allclose(cpu.samp_bilinear(tex,x,y,2)[...,0],[[0,1.5,0,3]])

    def test_no_dither_uses_half_coverage_paper_threshold(self):
        pal=np.array([[.2,.2,.2],[1,1,1]],np.float32)
        col=np.full((1,2,3),.2,np.float32);cov=np.array([[.4,.6]],np.float32)
        result=cpu.dither_and_quantize(col,cov,0,np.array([[0,.9375]],np.float32),.06,
                                     pal,cpu.oklab_vec(pal),2,'laundry',dither=False)
        np.testing.assert_array_equal(result,[[[255,255,255],[51,51,51]]])

    def test_duty_rest_and_parent_pivot(self):
        self.assertEqual(cpu.stroke(.5,.26,.16),0)
        p=[dict(kind='rigid',pivot=[2,3],amp=1,bias=0,k=3,phase=0,parent=-1),
           dict(kind='path',radius=[2,1],k=1,phase=.25,parent=0)]
        transforms=cpu.compute_part_transforms(p,0,12)
        np.testing.assert_allclose(transforms[0],[1,0,0,1,0,0],atol=1e-12)
        np.testing.assert_allclose(transforms[1],[1,0,0,1,2,0],atol=1e-12)


if __name__=='__main__':unittest.main()
