# pocketworld

Turn a reference painting into a dithered diorama that loops. The painting is the base layer. One WebGL2 shader moves layers of those pixels, then quantizes with a short OKLab palette and a 4×4 Bayer dither.

This is the default and the only mode. An earlier version drew people as signed-distance shapes. The figures always came out crude. That code is archived in `experimental/sdf/` and should not be extended.

Approved scenes, which this skill is written to reproduce:

- `examples/rain-bus-stop` — umbrella sway, a breath, lamp glow, ripples, drips, rain
- `examples/rooftop-laundry` — cloth warp, inpainted background, shadow sway, a cat's breath, motes
- `examples/chess-under-tree` — the generic `layers` profile: foliage sway, a chained rigid fan (forearm → hand + fan), a swaying shadow, a few falling leaves

All three are 260 cells, 12 seconds, 60 fps, seamless.

## What "good" means

Any picture the user hands you should reach this quality through the standard flow below, with almost no one-off code. You intervene only when a specific frame is wrong, and then only with the knob that matches that problem. The map is further down. Do not invent a new shader per scene.

## Standard flow

1. **Get the still.** Use `reference-prompt.md`. Square, white page, isometric, no black outlines. Save it as `examples/<name>/reference.jpg`.
2. **Pick a profile.** New scenes use `layers` (see *Motion layers* below): decompose the picture into parts, give each moving part a physical category, mark its anchor or pivot, pick amplitude and rhythm. The two older profiles stay for their approved scenes:
   - `rain` — wet ground, falling rain, drips, ripples, a glow, one or two rigid layers (an umbrella, a breathing torso).
   - `laundry` — cloth or foliage that warps, something still in front of it, optional animal, shadows, motes.
3. **Write `scene.json`.** Start from the nearest example. Change the polygons. Keep the `look` block unless a knob below says not to.
4. **Place points without guessing.** `node cli/pocketworld.js overlay examples/<name> --step 64` writes `overlay.png`, the reference with a numbered grid and any polygons you already have. Read coordinates off it. Drop to `--step 32` for a hem or a hand.
5. **Let colour propose masks.** `node cli/pocketworld.js suggest examples/<name>` writes `suggest.png` and `suggest.json`: eight key-colour candidates, a pale-cloth mask (the same test prep uses), and a dark-blue wet guess. Copy the points that land on the right material. Throw away the rings that don't. Rooftop was 88 hand points before this helper; you should not be clicking that many from a blank file.
6. **Prep.** `node cli/pocketworld.js prep examples/<name>` writes `build/`: the continuous base, the inpainted fill, the masks, `palette.png`, `manifest.json`.
7. **Look at the still before you trust the motion.** Open `build/base.png`. It should be the reference, in cells, airy, no black contour. Then `node cli/pocketworld.js dev` and open the playground, or the capture page `cli/page.html?scene=/examples/<name>/build/manifest.json&scale=4&t=3`.
8. **Render and judge.** `node cli/pocketworld.js render examples/<name>` writes `out/loop.mp4` (60 fps, nearest ×4, x264 crf 12, `tune animation`), `out/loop.gif`, `out/compare.png`, `out/contact.png`, `out/contact_detail.png`, and `out/metrics.json`.

The web component, once prep has run:

```html
<script type="module" src="/src/element.js"></script>
<pocket-world src="examples/rain-bus-stop/build/manifest.json"></pocket-world>
```

It pauses off screen. Reduced motion holds t = 0.

## Reference

The spec and the prompt live in `spec.md` and `reference-prompt.md`. Short version: 1024×1024, pure white, wide margin, 2:1 dimetric, edges dissolving into the paper, no text, no black outlines, one moment. If the still is wrong, fix the still. Prep cannot invent a gesture that was not drawn.

## scene.json

Coordinates are **reference pixels**, origin top-left. Both examples are 1024.

Shared `look` keys: `grid`, `K`, `kuwa`, `passes`, `haze`, `covBlur`, `spread`, `lift`, `chroma`, `saturation`, `contrast`.

`K` is not the final count. The fitter keeps every key colour and adds centres until it has about `K - 1` scene colours. `K: 21` with 7 or 8 keys yields 20 scene colours. Rain then appends paper white and two rain tints (23 total). Laundry appends paper white only.

`keyColours` is a list of `[x, y]`. Each point is the median of a 7×7 patch and is locked as a palette entry.

`palette`, if present, replaces k-means. Both approved examples set it. A jpeg that is a few levels off the original file will otherwise throw the k-means++ seed and repaint the dither, even when `build/base.png` is almost unchanged. Delete `palette` on a brand-new image so the fitter can run. Put it back only to lock a look you have already approved.

`loopSeconds` is 12. Do not change it unless every period below is rewritten to divide the new length.

### Rain

`polygons` holds rings in reference pixels. `wet`, `rainZone`, `occluder`, `glow`, and `detail` are a list of rings. `umbrella`, `man`, and the unused `outline*` rings are a single ring each. `despeckle` is where painted rain streaks get a light median before the downsample, so the live rain is not fighting a second set of streaks.

Also: `glowCenters` as `[x, y, radius]`, `drips` as `[x, y, fallDistance]`, `umbrellaPivot` as `[x, y]` on the hand, `manBreathTop` and `manBreathBottom` as y values, `fillPaperY` (395 on the bus stop) so the fill under the canopy is paper rather than a smear of her coat.

Prep builds the textures the shader expects:

| texture | channels |
|---|---|
| base, fill | colour |
| mask | R wet, G rain zone, B glow |
| mask2 | R coverage, G detail, B outline (0 in the approved look) |
| mask3 | R umbrella, G breath weight, B big coverage |
| mask4 | R fill coverage |

Ripple centres are 40 random wet cells, seed 7. You do not place them.

### Laundry

`cloth[]`: `name`, `poly` (4–6 points), `line` as `[x0, y0, x1, y1]` along the clothesline, `hem` in reference pixels, `amp` in cells at the hem, `phase` in radians. Neighbours differ by about 0.6–0.9.

`still` is the occluder polygon (the woman). The sheet that passes behind her is the piece named `sheet2`: prep continues that cloth through her silhouette and the shader draws `still` back on top.

`cat`: `poly`, `bottom`, `top`, `ear` as a 4-point rectangle.

`shadows[]`: `piece` name, floor `poly`, `gain` (0.8).

`motes`: a handful of `[x, y]`.

Cloth pixels are chosen by colour inside each polygon: light (`L > clothMinL`, default 0.62) and either low chroma (`clothMaxChroma`, default 0.042) or blue (`clothBlueChroma`, default 0.12). A median filter cleans the mask. If the sheet is the same colour as the wall, this test fails. Tighten the polygon, or loosen those three look keys. A hand polygon alone does not keep a pixel the test rejected.

## Motion layers (`"profile": "layers"`)

Motion is a list of layers, one per moving part, each of a physical **category**. Nothing is hardcoded per object: a fan, a pendulum and a door are all `rigid`. A new category is a new `type` in `prep_layers` (tools/pocketworld.py), one function in `layersLib` and one block in `layersMain` (src/shaders.js), plus a row here. Send it as a PR.

Workflow:

a. **Decompose** the reference into parts on `overlay.png`: what moves, what stays.
b. **Classify** each moving part into one category below. Few moving elements. Life is the environment.
c. **Mark the anchor or pivot**: the clothesline or branch line for soft parts, the grip / hinge / elbow for rigid parts.
d. **Pick amplitude and rhythm** from the table. Every period is rounded to a whole number of cycles per 12 s loop.

| `type` | for | keys (reference px unless noted) |
|---|---|---|
| `soft` | cloth, flags, hair, foliage, grass | `poly`, `line` [x0,y0,x1,y1] (anchor), `hem` (px from line to full swing; **negative = anchored at the bottom**, e.g. grass, a flame), `amp` cells, `phase` rad, `preset` `cloth` or `foliage`, optional `dir` degrees, `feather` px |
| `rigid` | fan, arm, pendulum, branch, windmill, door | `poly` (ring or list of rings), `pivot` [x,y], `amp` deg (negative = counter-clockwise on screen), `bias` deg, `period` s, `phase` 0–1, `snap` 0–0.3 (quicker outbound stroke, softer return), `parent` (name of an earlier rigid part: the child rides on it) |
| `path` | birds, clouds, boats | `poly`, `radius` [rx, ry] cells (a small figure-eight loop), `period`, `phase` |
| `particles` | rain, snow, falling leaves, motes, steam | `kind`, `zone` rings (steam: `origin` [x,y]), `density` 0–1, `size` cells, `fall` cells per loop, `color` |
| `waves` | water shimmer, ripples | `poly` (the wet area), `shimmer` 0–1, `ripples` 0–1 (13 per loop ≈ 0.92 s) |
| `light` | lamp breathe or flicker, glints, shadow sway | `mode` `breathe` / `flicker` / `glint` / `shadow`, `poly`, `amp`, `period`, `sway` cells, `color`, `blur` px |

At most 8 rigid/path parts, 4 lights, 4 particle layers.

How each works:

- **soft** warps the reference itself with a smooth weight field (zero on the anchor line, full at `hem`, feathered at the polygon edge). There is no colour test and no cut-out, so leaves and grass need no `clothMinL` / `clothMaxChroma` tricks and nothing tears. `foliage` adds a slow flutter that varies across the crown and drops the cloth hem lift.
- **rigid / path** parts are cut out by `poly` ∩ ink, minus `still`; the hole is inpainted in prep. The shader samples the part through the inverse transform about the pivot, so it moves as one piece and draws over whatever is behind it. Angle is `bias + amp · ease(u)`: 0 at t = 0 (the reference pose), peak, then back. `snap` warps time so the first half is quicker. A `parent` composes transforms: the child rotates about its own pivot, then follows the parent.
- **particles, waves, light** are the bus-stop and rooftop effects, exposed as layers.

`still` (one ring or a list) protects pixels from every layer. `detail` rings dither finer.

**Faces and hands.** Put every face, and every hand that does not hold a moving part, in `still`. A face at 260 cells is a few cells: it reads by being exactly the reference, so keep it expressive rather than trying to sharpen it, and never warp or rotate it. A hand that holds a rigid part goes with the part (the chess fan's hand rides with the fan).

**Out of scope for now:** a pose that is not in the reference. A part only moves around where it was drawn: the chess man's fan swings near his face, it cannot move from his side to his chest. Change the still instead.

Tuning per category:

- **soft** — too stiff: raise `amp` (foliage 1–1.3 cells, cloth 1.6–3.5). The anchor line moves: the `line` is on the wrong side, or `hem` sign is wrong. Edge of a crown shears: grow `poly` or raise `feather`. Neighbours in lockstep: spread `phase` by 0.6–2.
- **rigid** — keep 2–5° for a breath or a branch, 15–25° for a fan or a pendulum. A ghost of the part at rest: grow `poly` a few pixels. The part drags a bit of shirt along: tighten `poly` (ink inside it moves). The revealed hole looks smeared: lower `amp`; the inpaint is diffusion. Wrong direction: flip the sign of `amp`. Too mechanical: `snap` 0.15–0.25, chain a small parent swing (forearm 3–5°).
- **path** — `radius` 2–6 cells; a bird or a cloud should never leave the page.
- **particles** — density 0.05–0.15 for leaves, 0.3–0.5 for snow. Too busy: lower `density` before `size`. Leaves `fall` 48–96 cells per loop, snow 96–160.
- **waves** — shimmer 0.6–1, ripples 0.5–1. Ripples land on random wet cells (seed 7).
- **light** — `amp` 0.08–0.15. A flicker that strobes is too strong: halve `amp`. Shadow `sway` 1–2 cells, period 4–6 s.

Prep writes `base`, `fill`, `mask` (coverage, detail, fill coverage, hole), `soft`, `soft2` (preset, direction, wet), `part` and `pa0`/`pa1` (per-part alpha), `light`, `zone`. The manifest carries the part pivots, periods and parents; the player computes each part's transform every frame.

## The shader

`src/shaders.js` is the library. Both profiles share Bayer 4×4, OKLab, value noise, and `steam()`. Rain adds `rainLayer()`. Laundry adds `breeze()`, `clothDisp()`, and `moteField()`.

What each layer does:

- **Rain.** Three depths, slope 0.42 (top-right to bottom-left), so streaks reach the reflections. A drop travels an integer number of cells per loop: 240, 336, 432 cells over 12 s, in slots of 20, 28, 36. `rep / slot` has to stay an integer.
- **Shimmer.** On wet cells, noise sampled on a circle at harmonics 1, 2, 4. A lamp streak wobbles with the 2nd harmonic.
- **Ripples.** 13 spawns per loop (every 0.92 s) plus smaller rings on a 3 s cycle. Radius eases out cubic. The ring fades with `(1 - s)²`.
- **Drips.** Period is 6, 4, or 3 s. The bead hangs 1.1 s, then falls with gravity and leaves a splash.
- **Glow.** Lamp colour breathes on a 6 s sine. It tints covered cells. It is not part of the paper test.
- **Umbrella.** ±1.7° about the pivot, `sin` at 3 cycles per loop.
- **Breath.** His shoulders, 4 s, at most about 0.45 cell, phase-shifted from the umbrella. The cat's back is 3 s (4 per loop) and about 0.38 cell. One ear flick, 0.5 s, once per loop, at t = 7.4.
- **Cloth / foliage.** Backward map `colour(p) = layer(p − d(p))`. `d = amp · w^1.35 · breeze · n̂` plus a small upward lift of the hem. `n̂` is `normalize(vec2(-0.9, 0.45))`. Breeze is a 4 s wave travelling along the line, a 2 s harmonic, and a 12 s gust. Fold light `1 + 0.08 · w · cos(phase)` is applied before the dither. Sample bilinear, un-premultiply, `smoothstep` the alpha from 0.25 to 0.75.
- **Shadows.** `base / S(p) · S(p − d)`, same breeze, gain about 0.8. The floor texture stays put. Only the shadow edge moves.
- **Motes.** Closed paths, a 4 s twinkle.
- **Steam.** `steam(p, origin, ph)` is in the shared library and is not called by either approved scene. Mix it before the quantize if a scene needs a kettle or a vent: `col = mix(col, vec3(0.93, 0.94, 0.95), steam(p, origin, ph) * 0.35 * mask)`. The rise is 4 s, so it already divides the loop.

Paper test, rain: `max(coverage, dripAlpha * 0.9)` against the Bayer threshold, then a rare rain speck from the second-to-last palette entry. Laundry: coverage alone, paper is the last palette entry. The prose note "glow leaks onto the paper" is the lamp's colour mix on cells that are already covered, not a second paper test. Do not "fix" this. The approved frames were matched with the test as written.

Time is `uT`, continuous, wrapped with `mod` to the loop. Capture sets it to `frame / 60`.

## Motion rhythm

| thing | period | cycles in 12 s |
|---|---|---|
| umbrella sway, shoulder breath, cloth breath | 4 s | 3 |
| lamp glow, drip option | 6 s | 2 |
| cat breath, drip option | 3 s | 4 |
| cloth harmonic, ear is shorter | 2 s | 6 |
| main ripples | 0.923 s | 13 |
| gust swell, the whole loop | 12 s | 1 |

If you add a period, it has to divide 12. A 5 s sway will pop at the seam. Sample any noise on `vec2(cos(ph * k), sin(ph * k))` with `k` in {1, 2, 4} and `ph = TAU * t / loop`.

People stay almost still. If a person is the thing bouncing, the scene is wrong.

## Knobs

Change one, re-prep or re-render, look at `compare.png` and the detail strip. Do not change three at once.

| what you see | change |
|---|---|
| Too painterly, no cell structure | Lower `look.grid` toward 260. Do not go under ~240 or the faces melt. |
| Greasy, big flat colour areas | Less smoothing. `kuwa` 0 or 1, `passes` 1, `haze` 0.3, `posterize` 0, `mode` 0. Never turn posterize back on to "simplify". |
| Washed-out fold, a hero colour averaged into the wall | Add a `keyColours` point on that material. If the whole palette jumped after the jpeg was re-saved, set `palette` to the list you approved. |
| Muddy grey mid-tones | Raise `saturation` a little, keep `chroma` at 1.1, lift with `lift` 0.9 (rain) or 0.85 (sun). |
| Choppy, stuttering rain or cloth | Time is being stepped. It must stay continuous at 60 fps. Do not `floor(t * 12)`. |
| Motion too strong, rubber cloth, umbrella flailing | Lower `amp` (sheets 2.5–3.5, shirts 1.6–1.8). Umbrella is `radians(1.7)` in the rain `main`. Breath is `0.45` (him) and `0.38` (cat) cells. |
| Motion too weak, the loop looks frozen | Raise the same numbers a little. Add fold light rather than a huge `amp`. Check the mask is actually on the moving pixels. |
| Thin post eaten by the white fringe | `covBlur` near 1. The fringe grows outward only; a bigger blur eats detail. |
| Hole or a smear behind a moving piece | The fill did not cover the swing. Check `?t=` at max amplitude. Keep amplitudes modest: the fill is diffusion, and a large swing blurs a complex background. |
| Cloth mask missed the blue shirt, or ate the wall | `clothMinL`, `clothMaxChroma`, `clothBlueChroma`. Then check `suggest.png`. |
| Painted rain fighting the live rain | Put that road in `despeckle`. |
| Seam pops | A period does not divide 12, or a noise call is not on a loop harmonic. `metrics.json` `seamCells` will sit outside the per-frame range. |
| Dither looks like static, or bands are huge | `spread` near 0.06. Half that on figures is already applied. Do not switch to an 8×8 Bayer. The approved look is 4×4. |
| Black contour around a shoulder or the lamp | `outline` 0 and `ink` 0. Silhouettes come from the reference's own contrast. |

## Authoring polygons

A polygon is a ring of `[x, y]` in reference pixels, clockwise or not, no need to repeat the first point.

1. Run `overlay --step 64`. Every major line is labelled.
2. For a sheet or a skirt, four to six corners is enough. Click the clothesline as `line`, and set `hem` to the pixel distance from that line down to the bottom of the cloth.
3. For a person who only breathes, a loose box around the head and shoulders is enough (`man` on the bus stop). The weight falls from `manBreathTop` to `manBreathBottom`.
4. For an occluder, trace the silhouette that must stay put (`still`). Err a little large rather than a little small, or a gap opens at the edge.
5. Run `suggest` and steal key-colour points and any pale-cloth ring that already matches. Refine on the overlay. Do not trace 88 points by hand if the colour test already found the sheet.
6. Re-prep. Open `build/cloth.png` or `build/mask3.png`. The alpha should sit on the object, not on the wall.

`fillPaperY`, breath limits, and hems are the numbers that are easy to get wrong by 20 pixels. The overlay is how you check them.

## Verification

After every change that is supposed to be finished:

1. `compare.png` — reference on the left, t = 3 s on the right. Same scene, same gesture. Cells and dither on the right, the painting on the left. If the right-hand figure is a different person, the mask is wrong, not the dither.
2. `contact.png` — six frames across the loop. Nothing jumps.
3. `contact_detail.png` — four frames, 1/60 s apart, cropped on the subject. The change should crawl across the hem, the ripples, or the rain. A whole region flipping is a spike.
4. `metrics.json` — median cells changed, max/median, seam. Rain near 0.3% of cells. A quiet scene can be ~0.06%. The seam from frame 719 to frame 0 must sit in the normal range. Then look anyway. A melted face can be perfectly seamless.

The approved bus stop, measured on its MP4 at 260² with an RGB sum threshold of 40, is median 210 cells/frame (0.31%), max/median 1.44, seam 185. The rooftop is median 43 (0.06%), seam 37. Match the character of those numbers, not a single digit, and match the frames.

## Anti-patterns

- Drawing the figure in the shader. The reference already drew it.
- Black outlines, posterize, mode filter, Kuwahara radius above 2.
- Stepped animation. 12 fps rain looks choppy even when the loop is seamless.
- An 8×8 Bayer. Finer matrix, different grain. The locked look is 4×4.
- A palette bigger than 24 including paper, or smaller than about 16 scene colours.
- Amplitudes past ~3.5 cells. Cloth becomes rubber. The fill turns to mush.
- A new uniform that nothing sets. WebGL leaves it at 0 and the layer dies.
- Committing someone else's videos, or the study clips. Renders from this repo are fine.
- Copying the archived SDF rig back into `src/`.

## Known limits

- The cloth mask is a colour test. Cloth that matches its background needs a hand mask and usually a looser threshold, and even then a pixel the test rejects is gone.
- The fill is iterated neighbour diffusion. It is invisible when motion is small. A large swing over a detailed wall will look soft. Keep the amplitude modest instead of writing a smarter inpaint.
- Folds are baked into the cloth layer. They travel with the warp. They do not re-form.
- k-means++ is seed-stable only for a bit-identical source. A re-saved jpeg can reshuffle clusters. Lock `palette` once the look is approved.
- The shader's palette array is 24. Prep refuses a longer list.
- `layers`: a rigid part reveals an inpainted hole; it reads well for a fan over a shirt, less well for a big part over a detailed wall. Overlapping soft polygons do not blend: the stronger weight wins per cell.

## Files

| path | role |
|---|---|
| `tools/pocketworld.py` | prep, overlay, suggest, contact sheet, metric |
| `cli/pocketworld.js` | `prep`, `render`, `overlay`, `suggest`, `dev` |
| `src/shaders.js` | motion library and the three composites (`layers`, `rain`, `laundry`) |
| `src/player.js` | `mount(canvas, manifestUrl)` |
| `src/element.js` | `<pocket-world>` |
| `examples/rain-bus-stop` | approved rain scene |
| `examples/rooftop-laundry` | approved cloth scene |
| `examples/chess-under-tree` | `layers` test scene (rigid fan, foliage) |
| `experimental/sdf/` | retired procedural figures |
