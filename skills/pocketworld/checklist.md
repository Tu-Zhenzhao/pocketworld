# Scene checklist

Do these in order. Stop and look before you add motion.

## Working method: look, critique, fix

- [ ] Look in order: `overlay.png` (grid) → `build/parts.png` → each `out/<part>_phases.png` → `compare.png` and the contact sheets. After each one, write in `REPORT.md` "what I see / is it right".
- [ ] Zoomed crops (ffmpeg `crop` + `scale=...:flags=neighbor`) of faces, hands and every moving part, next to the same crop of the reference.
- [ ] Rubric, every round: the cutout is only the named object · no tearing, holes, halo or specks · colours match the reference (not more saturated, no greasy blocks, no black outlines) · faces readable · figures breathe or nod · each motion readable and sensible (direction, pivot, amplitude, breath/heartbeat rhythm) · seamless, no stepping.
- [ ] At least two rounds. In `REPORT.md`, each round lists issues, fix and an evidence image. Check `failures/README.md`.

## The picture

- [ ] Square, white page, isometric, no black outlines, readable heads and hands. See `reference_prompt.md`.
- [ ] Run `node cli/pocketworld.js check-ref <image>` to verify square aspect, clean white margins, low saturation, and lighting.
- [ ] Saved as `examples/<name>/reference.jpg`. Write a minimal `scene.json` (profile, reference, look, empty `layers`) before you run `overlay` or `suggest`.

## The look, before any motion

- [ ] `profile` is `layers` for a new scene (`rain` / `laundry` only for their approved scenes). `look.grid` is 260–300. `look.K` is 21 unless you have a reason.
- [ ] `kuwa` ≤ 2, `passes` 1, `posterize` 0, `mode` 0, `outline` 0, `ink` 0, `haze` about 0.3, `covBlur` about 1, `spread` 0.055–0.06.
- [ ] `layers`: `saturation` and `chroma` 0.9–1.0, never above 1.0. (The approved rain and laundry scenes keep 1.25 / 1.15. Don't copy those values.)
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
- [ ] `still` only for eyes, facial detail and small precise things. Never a whole figure. Faces go in `detail`.
- [ ] Every character has a subtle breath (soft, `dir` 270, negative `hem`, `amp` 0.3–0.5) or a 1–3° nod.
- [ ] Overlay at `--step 32` for small parts. Each poly is drawn on `overlay.png` and sits on its object before you prep.
- [ ] **Gate:** after prep, open `build/parts.png`. Write one line per part in `REPORT.md` (e.g. `fan: palm-leaf fan blade + hand, no table`). If a tile is not the object, fix the poly and re-prep.

## Motion

- [ ] Loop is 12 s. Every period you introduced divides 12.
- [ ] Amplitudes: umbrella about ±1.7°, breath under half a cell, sheets 2.5–3.5 cells at the hem, shirts 1.6–1.8, cat lift about 0.35 cell.
- [ ] Rigid minimum sweep: fan or handheld prop ≥12° about the grip, pendulum or door ≥10°, forearm parent 3–5°, branch 2–5°, nod 1–3°. Prep's printed sweep is ≥2 cells at the tip.
- [ ] **Gate:** after render (or `node cli/pocketworld.js phases <scene>`), open each `out/<part>_phases.png`. Confirm in `REPORT.md` that the motion reads as the intended action. The part moves as a whole, with no tearing, no hole and no ghost at rest.
- [ ] Freeze `?t=` at the biggest swing. The fill behind the cloth or the umbrella should be the background, not a hole and not a smear of the figure.

## Verify

- [ ] `node cli/pocketworld.js render <scene>`
- [ ] `out/compare.png`: same scene, same gesture, cells and dither instead of the painting.
- [ ] `out/contact.png` has no pop across the twelve seconds.
- [ ] `out/contact_detail.png`: four consecutive frames crawl.
- [ ] `out/metrics.json`: seam inside the normal range, max/median ≤ about 1.5, no single-frame spike.
- [ ] You looked. The metric does not see a melted face.
