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

    def test_duty_rest_and_parent_pivot(self):
        self.assertEqual(cpu.stroke(.5,.26,.16),0)
        p=[dict(kind='rigid',pivot=[2,3],amp=1,bias=0,k=3,phase=0,parent=-1),
           dict(kind='path',radius=[2,1],k=1,phase=.25,parent=0)]
        transforms=cpu.compute_part_transforms(p,0,12)
        np.testing.assert_allclose(transforms[0],[1,0,0,1,0,0],atol=1e-12)
        np.testing.assert_allclose(transforms[1],[1,0,0,1,2,0],atol=1e-12)


if __name__=='__main__':unittest.main()
