# Look spec

The reference painting is the base layer. Figures are never redrawn. They move as small shifts of their own pixels: a rotation about a pivot, a breath, a cloth warp. The shader adds light and water, then an ordered dither picks a colour from a short palette.

Approved looks: `examples/rain-bus-stop` (v3a) and `examples/rooftop-laundry`.

## Grid

- 260–300 cells across. Both approved scenes use **260**.
- Display at **4 px per cell**, nearest-neighbour, integer scale only.
- Capture at 1 px per cell, then nearest-neighbour ×4.
- Under ~240 cells the figures turn into smudges. A faithful downsample with no visible cells looks like a painting, which is the wrong look.

## Palette

- About 20 scene colours (18–24), plus paper white. Rain also keeps two pale rain tints.
- OKLab k-means, chroma weighted ×2.2. Story areas are weighted higher (figures, cloth, the lamp, wet ground).
- **Key colours are fixed.** One point on each hero material (umbrella light and dark, coat, hoodie, skin, lamp, each cloth, the animal) so those colours never average into the wall.
- No black ink entry. The darkest colour is one the reference actually has.
- The shader holds 24 colours including paper. Stay under that.
- Clean the values: OKLab L lifted (`L^0.9` in the rain, `L^0.85` on a sunny scene), chroma ×1.1. The ground and the paper should look airy, not grey.

## Dither

- **Ordered Bayer 4×4**, as an OKLab lightness offset, then nearest palette colour with chroma weighted ×2.
- Spread about **0.055–0.06**. Less on figures (`×0.45` where the detail mask is high). None of that offset is used in the paper test.
- Feed the shader the **continuous** downsampled colour. The dither builds the gradients. Posterized blocks look greasy.
- The dither is also the motion quantizer. A smooth field crosses a threshold and cells flip one at a time.

## Edges

Coverage is blurred about 1 cell and only allowed to grow outward (`max(cov, blur(cov))`), so a thin lamp post stays solid. The paper test compares that coverage to the same Bayer threshold. The page outside the diorama is white. Rain on the paper is a rare faint speck, not a streak.

## Motion

- **60 fps, continuous time.** Never `floor(t * fps)`.
- **12 second seamless loop.** Every period divides 12. Noise is sampled on a circle in noise space at harmonics 1, 2 and 4 of the loop.
- Breath is 4–6 s. A heartbeat is about 0.9 s. Both divide the loop (3×4 s, 2×6 s, 13 ripples in 12 s ≈ 0.92 s).
- Easing is sine, smoothstep, or a cubic ease-out. Nothing snaps on and off.
- People stay almost still. Life is the environment: rain, water, light, cloth, a breath, an ear.

## Smoothness

Decode the MP4 at cell resolution. Count cells whose RGB sum changes by more than 40.

- Rain wants about **0.2–0.3%** of cells per frame. The approved bus stop is 0.31%.
- A quiet scene is lower. The rooftop median is 43 cells/frame, 0.06%. Judge a quiet scene by the absence of spikes, not by the rain number.
- max/median ≤ about 1.5. The seam from the last frame back to the first sits inside the normal per-frame range.
- Four consecutive frames, zoomed in, should crawl. A pop is a bug.

## What killed earlier versions

- Black or dark outlines.
- Posterize, a mode filter, or a strong Kuwahara. Flat colour areas look greasy.
- Heavy blur. Haze stays near 0.3 cells.
- Grey, dull mid-tones.
- Stepped 12 fps time. The rain felt choppy.
- Drawing the people as SDFs. The proportions and the gesture were never the reference. That code is in `experimental/sdf/` and is not the pipeline.
