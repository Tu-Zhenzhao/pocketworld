# Scene checklist

Do these in order. Stop and look before you add motion.

## The picture

- [ ] Square, white page, isometric, no black outlines, readable heads and hands. See `reference-prompt.md`.
- [ ] Saved as `examples/<name>/reference.jpg`. `scene.json` points at `reference.jpg`.

## The look, before any motion

- [ ] `profile` is `layers` for a new scene (`rain` / `laundry` only for their approved scenes). `look.grid` is 260–300. `look.K` is 21 unless you have a reason.
- [ ] `kuwa` ≤ 2, `passes` 1, `posterize` 0, `mode` 0, `outline` 0, `ink` 0, `haze` about 0.3, `covBlur` about 1, `spread` 0.055–0.06.
- [ ] Rain: `lift` 0.9, `saturation` 1.25, `contrast` 1.08. Sunny: `lift` 0.85, `saturation` 1.15, `contrast` 1.04.
- [ ] 6–10 `keyColours`, one point on each hero material. Read them off `overlay.png`.
- [ ] `node cli/pocketworld.js prep <scene>` then open `build/base.png` and `build/palette.png`. The still should already look like the reference, in cells.

## Masks

Rain:

- [ ] Polygons for wet ground, rain zone, occluders, glow, figure detail, umbrella, the breathing upper body.
- [ ] `umbrellaPivot` on the hand. `manBreathTop` / `manBreathBottom` around the shoulders and the lap.
- [ ] `glowCenters` on the lamp. `drips` as `[x, y, fall]` in reference pixels.
- [ ] `fillPaperY` under the canopy, where the background is paper.

Laundry and anything with cloth or foliage:

- [ ] Each moving piece: a polygon (4–6 points), an anchor `line` (two points), `hem`, `amp`, `phase`.
- [ ] A `still` polygon for every occluder in front of a moving piece (the woman in front of the sheet).
- [ ] Animal: polygon, `top`, `bottom`, ear rectangle.
- [ ] One shadow polygon per casting piece, on the floor.
- [ ] A few mote positions, or none.
- [ ] `suggest.png` pale mask covers the cloth and not the wall. If it misses, loosen `clothMinL` / `clothMaxChroma`, or draw a tighter polygon.

Layers:

- [ ] Every moving part listed with a `type` (soft, rigid, path, particles, waves, light). Few of them.
- [ ] Soft parts: anchor `line` on the fixed edge, `hem` (negative when anchored at the bottom), `preset` foliage for leaves and grass.
- [ ] Rigid parts: `pivot` on the grip / hinge / elbow, a tight `poly`, child parts list their `parent` after it.
- [ ] Faces, and hands that hold nothing moving, in `still`.
- [ ] `overlay.png` shows every poly, line and pivot where you meant it.

## Motion

- [ ] Loop is 12 s. Every period you introduced divides 12.
- [ ] Amplitudes: umbrella about ±1.7°, breath under half a cell, sheets 2.5–3.5 cells at the hem, shirts 1.6–1.8, cat lift about 0.35 cell.
- [ ] Rigid parts: crop four phases of one period. The part moves as a whole, no tearing, no hole, no ghost at rest.
- [ ] Freeze `?t=` at the biggest swing. The fill behind the cloth or the umbrella should be the background, not a hole and not a smear of the figure.

## Verify

- [ ] `node cli/pocketworld.js render <scene>`
- [ ] `out/compare.png`: same scene, same gesture, cells and dither instead of the painting.
- [ ] `out/contact.png` has no pop across the twelve seconds.
- [ ] `out/contact_detail.png`: four consecutive frames crawl.
- [ ] `out/metrics.json`: seam inside the normal range, max/median ≤ about 1.5, no single-frame spike.
- [ ] You looked. The metric does not see a melted face.
