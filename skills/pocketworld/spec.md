# Pocket-world spec

Every scene should look like it belongs to one series. The numbers below were measured from a set of study loops (a fishing pier, a driveway hoop, a juggler, a market stall) and then standardized. `src/spec.js` is the copy the runtime actually uses. If the two disagree, `src/spec.js` wins.

## Frame

- Square, 1:1. The canvas bitmap is the output. The shader snaps UVs to the grid, so the upscale is nearest-neighbor even before CSS.
- Internal grid **360**. Output can be 640 or 720. Do not anti-alias.
- **12 fps**, stepped. `floor(t * fps) / fps` inside the loop. `setTime` is exact, then quantized the same way.
- Loop length **8–12 seconds**. Shorter is fine when the action is one cycle (the hoop is 6s, the juggler is 6s) as long as every oscillator closes.
- Ordered Bayer dither, **4×4** by default, 8×8 as a knob. No bloom, no CRT, no ink outline, no gradients painted in RGB.

## Camera

2:1 dimetric. One world unit of +X moves **2 right and 1 down**. +Y moves **2 left and 1 down**. Height goes straight up, which is negative screen Y, because screen Y grows downward.

```
screen = origin + axisX * ground + axisY * ground.y + (0, -height)
```

Defaults, in screen units where the canvas is 1×1:

| | |
|---|---|
| origin | `[0.5, 0.4]` |
| axisX | `[0.3, 0.15]` |
| axisY | `[-0.3, 0.15]` |

The fishing study measured a long pier edge closer to 34° from horizontal (true isometric is 30°, 2:1 is atan(1/2) ≈ 26.6°). We lock **2:1** so a new scene cannot drift. People stand screen-vertical. They are not leaned into the ground plane.

## Framing

One floating vignette on pure white (`#ffffff`). Content fades out through the dither, it is not a hard oval pasted on.

| | |
|---|---|
| fill, width | 58–86% of the frame |
| fill, height | 40–60% |
| side margins | about 8% |
| top margin | about 18% or more |
| bottom margin | about 16% or more |

A single figure (the juggler) may sit at the low end of the fill. A pier or a street should not.

Measured study frames, for the record:

| | size | fill |
|---|---|---|
| fishing | 1474×1432 | ~86% × 43%, margins L 8% R 6% T 30% B 26% |
| basketball | 1450×1346 | ~88% × 53% |
| juggler | 1450×1346 | ~58% × 47% |
| market | 1786×1658 | ~84% × 59% |

## Palette

Target **16** colors, hard maximum **24**, plus the white background. Sample them from the reference, then delete near-duplicates. A ramp is 3 or 4 of those colors, dark to light. The shader shades a float in 0..1, thresholds it with Bayer, then picks a ramp stop. Mixing two arbitrary RGB colors invents a hue the palette does not have. Don't.

Study colors worth keeping in mind, not copying blindly: water `#5a93a0` / `#8cb8c2` / `#254455`, ink `#111215`, warm wood around `#b89058`.

## Light

From the upper left. `light.dir` is screen-space, and Y grows downward, so "up" is a negative Y. A useful character setup is ambient **0.28–0.34** and diffuse **0.62–0.70**. Ambient near 0.5 never reaches the dark stop of a 3-color ramp, and the figure goes flat.

Ground shade is painted on purpose. Lowering ambient does not crush the road.

## What the series is not

Not photoreal, not a smooth 3D render, not full-bleed, not perspective, not 1:1 isometric, not outlined, not glowing. A reference image from an image model will try to be all of those. Conform it. See `reference-prompt.md` and the checklist in `SKILL.md`.
