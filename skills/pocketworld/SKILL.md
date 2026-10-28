# pocketworld

Turn a reference painting into a dithered diorama that loops. The painting is the base layer. One WebGL2 shader moves layers of those pixels, then quantizes with a short OKLab palette and a 4×4 Bayer dither.

This is the default and the only mode. An earlier version drew people as signed-distance shapes. The figures always came out crude. That code is archived in `experimental/sdf/` and should not be extended.

Approved scenes, which this skill is written to reproduce:

- `examples/rain-bus-stop` — umbrella sway, a breath, lamp glow, ripples, drips, rain
- `examples/rooftop-laundry` — cloth warp, inpainted background, shadow sway, a cat's breath, motes
- `examples/chess-under-tree` — the generic `layers` profile: foliage sway, a chained rigid fan (forearm → hand + fan), a swaying shadow, a few falling leaves
- `examples/snow-campfire` — leaping campfire flames, dual-harmonic flicker light, breathing camper, resting dog with rigid duty-cycle ear flick, drifting snow
- `examples/lake-boat` — trembling fishing rod, lake water waves and ripples, fisherman breathing, foliage sway, lantern flicker, drifting fireflies

All three are 260 cells, 12 seconds, 60 fps, seamless.

## What "good" means

Any picture the user hands you should reach this quality through the standard flow below, with almost no one-off code. You intervene only when a specific frame is wrong, and then only with the knob that matches that problem. The map is further down. Do not invent a new shader per scene.

## Working method: look, critique, fix

Never trust a number you have not looked at. Open these in order. After each one, write in `REPORT.md` **what I see / is it right**:

1. `overlay.png` (grid on, every poly drawn) — each poly hugs the object it names.
2. `build/parts.png` — each tile IS the named object, nothing else. Confirm each tile in writing, e.g. `fan: palm-leaf fan blade + hand, no table`. Wrong: fix the poly, re-prep.
3. `out/<part>_phases.png` for every rigid part (and each breath) — the motion reads as the intended action.
4. `out/compare.png`, `contact.png`, `contact_detail.png`.

Zoom in. Crop faces, hands and every moving part, and set each one next to the same crop of the reference:

```sh
ffmpeg -v error -i out/loop.mp4 -ss 1.5 -frames:v 1 -vf "crop=200:200:560:540,scale=600:600:flags=neighbor" crop_t.png
ffmpeg -v error -i reference.jpg -vf "scale=1040:1040,crop=200:200:560:540,scale=600:600:flags=neighbor" crop_ref.png
```

Rubric, run every round:

- Each cutout contains only the named object.
- No tearing, holes, halo or specks.
- The colours match the reference: not more saturated, no greasy flat blocks, no black outlines.
- Faces are readable and expressive.
- Figures are alive: each one breathes or nods.
- Each motion is readable and physically sensible: direction, pivot, amplitude, and a rhythm at breath or heartbeat pace.
- The loop is seamless, with no stepping.

Do at least two rounds. For each round, `REPORT.md` lists the issues found, the fix you applied, and one evidence image. Known traps are in [failures/](failures/README.md).

## Standard flow

### Environment first (v0.3.0)

Run `node cli/pocketworld.js doctor --json` before creating or rendering a scene. Use a Python venv, `pip install -r requirements.txt`, and set `PYTHON` to its executable. Doctor reports the selected backend and raw stage errors. Missing Chrome is nonfatal when the CPU frame and encoding checks pass; host permissions cannot always be fixed with Chrome flags.

`render` defaults to `--backend auto`: a bounded inline browser/WebGL/readPixels probe, then CPU fallback. `--backend cpu` never launches Chrome. Browser export inlines all resources and blocks HTTP/file requests; use `--server` only to diagnose the legacy localhost path. `CHROME` selects an executable; `CHROME_FLAGS` appends space-separated launch arguments. `imageio-ffmpeg` supplies the preferred encoder, followed by system ffmpeg; `FFMPEG_PATH` is an authoritative optional override.

Use `render <scene> --smoke` for ten frames before the full render. Use `--frames 0:360` then `--frames 360:720` to split the 720-frame run. Both commands use an input/code fingerprint under `build/frames/`; complete frames are reused, changed inputs receive a new cache. Smoke/partial runs do not publish `out/`. Avoid concurrent renders of one scene. Newer scene/reference inputs or changed prep code automatically trigger prep; `--force-prep` forces it.

Inspect `build/last-run.json` and `out/render.json`: only a newly completed attempt and matching artifact/input hashes establish success. An old `out/loop.mp4` is not a new result. No ffmpeg means GIF + PNG frames + all diagnostic images/metrics, with explicit `complete-gif-only` status and no MP4. Metrics identify `decoded-mp4` versus `png-frames` as their source. Phase images now read cached frames directly; the generic `motion_phases.png` also covers rain/laundry.

CPU math matches the CLI's SwiftShader software renderer (ARM fused / x86 separate multiply-add). `POCKETWORLD_SHADER_MATH=fused|separate` can select a different JIT math mode; it invalidates the frame cache. After changing either shader or CPU code run `node cli/pocketworld.js parity`; it checks all five examples at six times, reports exact differing-cell ratios and channel deltas, and writes difference images. The default gate is 0.02% differing cells. Explain residual threshold flips and inspect their images. Hardware GPU rounding may differ; do not claim universal bit identity.

### Step 0: Get a good reference image

Read `skills/pocketworld/reference_prompt.md` first. The painting is the base layer of the entire pipeline. The WebGL shader only translates, rotates, and warps existing pixels before quantizing them through an OKLab palette and a 4×4 Bayer dither. It cannot fix bad drawing, wrong perspective, muddy contrast, or cartoon outlines.

**Generating a reference still with an image model is the recommended path.**

#### Loose on content, firm on style
Pocketworld is **loose on content, firm on style**. You can depict any scene or story you want (a quiet bus stop, a rooftop terrace, friends playing chess, a campfire in the snow, a noodle cart, a fisherman on a lake, a garden greenhouse). But the visual contract is strict:

- **What a good reference looks like:**
  - **Square (1:1, 1024×1024)**: Canonical coordinate space for `scene.json` and prep.
  - **Isometric diorama perspective**: 2:1 dimetric perspective (ground recedes down-left and down-right, verticals upright, camera looking down like a miniature model on a desk).
  - **Plain white / clean background**: Pure paper white (`#FFFFFF`) with wide, empty margins. The diorama floats as a contained subject; edges fade or dissolve softly into the white paper.
  - **Pixel-art / painterly pixel aesthetic**: Readable textures (wood, cloth, asphalt, stone, foliage, water) that translate naturally into a 260-cell dither grid.
  - **Low-saturation refined palette**: Natural watercolor/gouache tones. Muted earthy or atmospheric hues with 1–2 restrained accents. Never neon or candy-colored.
  - **No black outlines**: Depth and shapes read from light, color, and value contrast—never comic ink contours or dark cartoon strokes.
  - **Subjects separated with clear gaps**: Distinct negative space between figures and props so polygon cutouts stay clean.
  - **Moving parts drawn clearly and unoccluded**: Anything that moves later (cloth, an umbrella, a fan, branches, animal ears, water puddle, fishing rod) must be visible, delineated, and unoccluded.
  - **No text, watermark, logo, or border**: No lettering or frame cards.

#### Composition & Footprint Variety (Do not over-constrain to a square block)

User guidance:
> "在生成这些图画的时候，不要简简单单的就是限制于就是这么一个正方形区域，没有明显的边界，或者说那种淡淡的感觉，其实都很好，你看以前那个那个艺术家，角度其实一样的，但里面内容是很闲适，很风格的，有长一点儿的，有短一点儿的，有专门就是一个像舞台一样的抛球的呀，对吧？这个我觉得可以加一下，就是在skill里面提一下就行了"

**What this means for generation**:
Keep the same **2:1 dimetric isometric camera angle** (and 1024×1024 square canvas floating on pure `#FFFFFF` white margins), but do **NOT** force every scene into a square island block. Let the composition footprint match the subject:
- **Square island block**: e.g., a city sidewalk curb, bus stop corner, or courtyard (`examples/rain-bus-stop`, `examples/chess-under-tree`).
- **Long strip / elongated slice**: e.g., a narrow pier, riverbank stretch, sidewalk path, or shoreline.
- **Short narrow slice**: e.g., a doorway threshold, garden wall, or cafe window.
- **Small circular/oval stage or platform**: e.g., a street performer or juggler on a small round wooden stage.
- **Open vignette with soft fading perimeter**: No hard geometric ground cut; water ripples, mist, ground haze, or cobblestones gently dissolve and fade into the pure white paper without hard edges (e.g., `examples/lake-boat`, `examples/snow-campfire`).

Teach agents to pick the composition footprint that naturally fits the scene rather than defaulting to a block. `check-ref` checks the 1:1 image canvas, pure white margins, saturation, and brightness—it never requires a square block geometry.

- **What is NOT acceptable:**
  - ❌ **Random street photos or real-world snapshots**: Cluttered backgrounds, camera lens distortion, edge-to-edge coverage, and noisy real-world lighting break prep, inpainting, and palette fitting.
  - ❌ **Cluttered edge-to-edge scenes**: Backgrounds that fill the canvas up to the frame boundaries.
  - ❌ **Heavy black outlines or vector cel-shading**: Ink lines create dark greasy fringes in ordered Bayer dithering.
  - ❌ **Oversaturated or candy-colored palettes**: Neon hues blow out the short OKLab palette.
  - ❌ **Cropped subjects or occluded moving parts**: Moving pieces tangled into backgrounds or touching frame edges cannot be cleanly cut out and inpainted.

#### Quick CLI tools:
```bash
# 1. Generate a tailored prompt from your concept (in any language):
node cli/pocketworld.js prompt "rainy night ramen cart with glowing amber lantern"

# 2. Feed the prompt to an image model (Midjourney, DALL-E, Flux, Imagen, Stable Diffusion).
#    Save the image to examples/<name>/reference.jpg

# 3. Validate the reference image immediately:
node cli/pocketworld.js check-ref examples/<name>/reference.jpg
```

1. **Save the still.** Verify it with `node cli/pocketworld.js check-ref examples/<name>/reference.jpg`. Save it as `examples/<name>/reference.jpg`.
2. **Pick a profile.** New scenes use `layers` (see *Motion layers* below): decompose the picture into parts, give each moving part a physical category, mark its anchor or pivot, pick amplitude and rhythm. The two older profiles stay for their approved scenes:
   - `rain` — wet ground, falling rain, drips, ripples, a glow, one or two rigid layers (an umbrella, a breathing torso).
   - `laundry` — cloth or foliage that warps, something still in front of it, optional animal, shadows, motes.
3. **Write a minimal `scene.json` first.** `overlay` and `suggest` need it. Start with:
   ```json
   {"profile": "layers", "reference": "reference.jpg", "loopSeconds": 12,
    "look": {"grid": 260, "K": 21, "kuwa": 1, "passes": 1, "haze": 0.3, "covBlur": 1, "spread": 0.055,
             "lift": 0.9, "chroma": 0.95, "saturation": 0.92, "contrast": 1.02},
    "layers": []}
   ```
   Then add polygons from the nearest example. Keep the `look` block unless a knob below says not to.
4. **Place points without guessing.** `node cli/pocketworld.js overlay examples/<name> --step 64` writes `overlay.png`, the reference with a numbered grid and any polygons you already have. Read coordinates off it. Use `--step 32` for a hem, a hand, a fan or any other small part. Before you prep, add each poly to `scene.json`, re-run `overlay`, and check that the drawn outline sits on its object.
5. **Let colour propose masks.** `node cli/pocketworld.js suggest examples/<name>` writes `suggest.png` and `suggest.json`: eight key-colour candidates, a pale-cloth mask (the same test prep uses), and a dark-blue wet guess. Copy the points that land on the right material. Throw away the rings that don't. Rooftop was 88 hand points before this helper; you should not be clicking that many from a blank file.
6. **Prep.** `node cli/pocketworld.js prep examples/<name>` writes `build/`: the continuous base, the inpainted fill, the masks, `palette.png`, `manifest.json`, and `parts.png`. Prep also prints lint lines (clamped saturation, oversized `still` rings, each rigid part's sweep in cells).
   **Gate (mandatory):** open `build/parts.png`. Every moving layer's cutout (poly ∩ ink minus `still`) is shown zoomed on grey, with its pivot as a red dot and a thumbnail of the poly. In `REPORT.md`, write one line per part saying what the tile shows, e.g. `fan: palm-leaf fan blade + hand, no table`. If a tile is not the named object, fix the poly and re-prep. Do not render first.
7. **Look at the still before you trust the motion.** Open `build/base.png`. It should be the reference, in cells, airy, no black contour. Then `node cli/pocketworld.js dev` and open the playground, or the capture page `cli/page.html?scene=/examples/<name>/build/manifest.json&scale=4&t=3`.
8. **Render and judge.** `node cli/pocketworld.js render examples/<name>` writes `out/loop.mp4` (60 fps, nearest ×4, x264 crf 12, `tune animation`), `out/loop.gif`, `out/compare.png`, `out/contact.png`, `out/contact_detail.png`, `out/metrics.json`, and `out/<name>_phases.png` for each rigid part and each non-foliage soft part. `node cli/pocketworld.js phases examples/<name>` rebuilds only the phase strips: 4 zoomed crops of that part across one cycle, labelled with the time.
   **Gate (mandatory):** open each `<part>_phases.png`. In `REPORT.md`, confirm the motion reads as the intended action (e.g. `fan: blade sweeps ~17° about the grip, visible air stroke`). If you can't see it moving, the amplitude is too small.

The web component, once prep has run:

```html
<script type="module" src="/src/element.js"></script>
<pocket-world src="examples/rain-bus-stop/build/manifest.json"></pocket-world>
```

It pauses off screen. Reduced motion holds t = 0.

## Reference

The spec and the prompt live in `spec.md` and `reference_prompt.md`. Short version: 1024×1024, pure white, wide margin, 2:1 dimetric, edges dissolving into the paper, no text, no black outlines, one moment. If the still is wrong, fix the still. Prep cannot invent a gesture that was not drawn.

## scene.json

Coordinates are **reference pixels**, origin top-left. Both examples are 1024.

Shared `look` keys: `grid`, `K`, `kuwa`, `passes`, `haze`, `covBlur`, `spread`, `lift`, `chroma`, `saturation`, `contrast`.

**Never raise `saturation` or `chroma` above 1.0. Use 0.9–1.0.** The palette is meant to be refined, not candy. `layers` prep clamps anything above 1.0 and warns. The approved rain and laundry scenes keep their own values.

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
| `rigid` | fan, arm, pendulum, branch, windmill, door | `poly` (ring or list of rings), `pivot` [x,y], `amp` deg (negative = counter-clockwise on screen), `bias` deg, `period` s, `phase` 0–1, `snap` 0–0.3 (quicker outbound stroke, softer return), `duty` 0–1 (stroke completes within fraction of cycle, rests motionless for remainder; default 1.0), `parent` (name of an earlier rigid part: the child rides on it) |
| `path` | birds, clouds, boats | `poly`, `radius` [rx, ry] cells (a small figure-eight loop), `period`, `phase` |
| `particles` | rain, snow, falling leaves, motes, steam | `kind`, `zone` rings (steam: `origin` [x,y]), `density` 0–1, `size` cells, `fall` cells per loop, `color` |
| `waves` | water shimmer, ripples | `poly` (the wet area), `shimmer` 0–1, `ripples` 0–1 (13 per loop ≈ 0.92 s) |
| `light` | lamp breathe or flicker, glints, shadow sway | `mode` `breathe` / `flicker` / `glint` / `shadow`, `poly`, `amp`, `period`, `sway` cells, `color`, `blur` px |

At most 8 rigid/path parts, 4 lights, 4 particle layers.

How each works:

- **soft** warps the reference itself with a smooth weight field (zero on the anchor line, full at `hem`, feathered at the polygon edge). There is no colour test and no cut-out, so leaves and grass need no `clothMinL` / `clothMaxChroma` tricks and nothing tears. `foliage` adds a slow flutter that varies across the crown and drops the cloth hem lift.
- **rigid / path** parts are cut out by `poly` ∩ ink, minus `still`; the hole is inpainted in prep. The shader samples the part through the inverse transform about the pivot, so it moves as one piece and draws over whatever is behind it. Angle is `bias + amp · ease(u)`: 0 at t = 0 (the reference pose), peak, then back. `snap` warps time so the first half is quicker. `duty` (0..1) lets a stroke complete in a fraction of its cycle and sit motionless for the rest, for natural occasional twitches (e.g. an animal's ear). A `parent` composes transforms: the child rotates about its own pivot, then follows the parent.
- **particles, waves, light** are the bus-stop and rooftop effects, exposed as layers.

`still` (one ring or a list), in `layers`, is masked out of all motion: soft weight is zero there and it is cut out of every rigid part. (In `laundry`, `still` is different: it is an occluder drawn back on top of the cloth.) `detail` rings dither finer.

`erase` (or `inpaint`, one ring or a list), in `layers`, removes painted features from the reference that should not appear in the animation (e.g. frozen smoke plumes, static steam columns, or stray marks). Prep inpaints both RGB and diorama coverage across the erased polygon via 4-neighbour diffusion into the surrounding background and paper white.
- **Removing painted smoke or steam**: When the user requests removing smoke ("去掉烟"), trace the painted plume into `erase`. Simply deleting motion layers leaves a static grey column frozen above the fire or cup.
- **Replacing painted plume with particles**: Put the painted plume into `erase` so it disappears from the base, then add a `particles` layer (`kind: "steam"`) anchored at the origin.

**`still` is small.** Use it only for eyes, facial detail and small precise things (a hand resting on a board). Never put a whole figure in `still`: the figure freezes, and a soft layer around it tears at the edge. Prep warns about a `still` ring larger than about 90×90 px.

**Faces.** Put faces in `detail`, not `still`. A face at 260 cells is a few cells: it reads by being exactly the reference, so keep it expressive rather than sharpening it, and never rotate it. A hand that holds a rigid part goes with the part (the fan's hand rides with the fan).

**Figures breathe by default.** Give every character a subtle breath layer: a `soft` layer over the torso, `line` along the seat or waist, a negative `hem` (anchored at the bottom), `dir` 270 (up), `amp` 0.3–0.5 cells, `preset` `cloth`, `feather` 6, and a different `phase` per person. The alternative is a rigid nod: head and shoulders, pivot at the neck, 1–3°, with the face not in `still`.

**Out of scope for now:** a pose that is not in the reference. A part only moves around where it was drawn: the chess man's fan swings near his face, it cannot move from his side to his chest. Change the still instead.

Tuning per category:

- **soft** — too stiff: raise `amp` (foliage 1–1.3 cells, cloth 1.6–3.5). The anchor line moves: the `line` is on the wrong side, or `hem` sign is wrong. Edge of a crown shears: grow `poly` or raise `feather`. Neighbours in lockstep: spread `phase` by 0.6–2.
- **rigid** — the motion must be readable. Minimum sweep about the pivot:

  | part | amp |
  |---|---|
  | fan, handheld prop (about the grip) | ≥12°, usually 15–25° |
  | pendulum, door, sign | ≥10° |
  | forearm as parent | 3–5° |
  | branch | 2–5° |
  | head nod | 1–3° |

  Prep prints `sweep N cells at the tip`. Under about 2 cells, nobody will see it. A ghost of the part at rest: grow `poly` a few pixels. The part drags a bit of shirt along: tighten `poly` (ink inside it moves). The revealed hole looks smeared: lower `amp`; the inpaint is diffusion. Wrong direction: flip the sign of `amp`. Too mechanical: `snap` 0.15–0.25, chain a small parent swing (forearm 3–5°).
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
- **Steam.** In `layers`, use a `particles` layer with `kind` `steam` and `origin` [x, y] at the spout. It needs no shader code. The rise is 4 s, so it divides the loop.

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

People stay almost still, but alive: a breath or a nod. If a person is the thing bouncing, the scene is wrong.

## Knobs

Change one, re-prep or re-render, look at `compare.png` and the detail strip. Do not change three at once.

| what you see | change |
|---|---|
| Too painterly, no cell structure | Lower `look.grid` toward 260. Do not go under ~240 or the faces melt. |
| Greasy, big flat colour areas | Less smoothing. `kuwa` 0 or 1, `passes` 1, `haze` 0.3, `posterize` 0, `mode` 0. Never turn posterize back on to "simplify". |
| Washed-out fold, a hero colour averaged into the wall | Add a `keyColours` point on that material. If the whole palette jumped after the jpeg was re-saved, set `palette` to the list you approved. |
| Muddy grey mid-tones | Add a `keyColours` point on the hero colour first. Then `lift` 0.9 (rain) or 0.85 (sun). Keep `saturation` and `chroma` ≤ 1.0. |
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
| `cli/pocketworld.js` | `prep`, `render`, `phases`, `overlay`, `suggest`, `dev` |
| `build/parts.png` | prep's contact sheet of every moving cutout (gate) |
| `out/<part>_phases.png` | render/`phases`: one part across its cycle (gate) |
| `skills/pocketworld/failures/` | common failures: symptom, cause, fix |
| `src/shaders.js` | motion library and the three composites (`layers`, `rain`, `laundry`) |
| `src/player.js` | `mount(canvas, manifestUrl)` |
| `src/element.js` | `<pocket-world>` |
| `examples/rain-bus-stop` | approved rain scene |
| `examples/rooftop-laundry` | approved cloth scene |
| `examples/chess-under-tree` | `layers` scene (rigid fan, foliage sway) |
| `examples/snow-campfire` | `layers` scene (campfire, rigid duty ear flick, snow) |
| `examples/lake-boat` | `layers` scene (trembling rod, water waves, fireflies) |
| `experimental/sdf/` | retired procedural figures |
