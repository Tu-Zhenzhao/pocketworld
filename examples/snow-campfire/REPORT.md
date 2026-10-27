# snow-campfire Report

Scene implementation and iteration report for `examples/snow-campfire`.

User prompt:
> 雪地篝火：一小块雪地，帐篷里透出暖光。一个人裹着红毯子坐在木头上烤手，火苗跳动，烟慢慢往上飘，狗趴在旁边，耳朵偶尔动一下。

---

## 1. Scene Decomposition & Profile Selection

Following `skills/pocketworld/SKILL.md`, new scenes use the generic `"profile": "layers"`. The scene is decomposed by physical category:

1. **Tent warm light (`tent_light`)**: `light` layer, mode `breathe` (0), 6s cycle (2 cycles per 12s), warm amber tint `[1.0, 0.85, 0.5]`.
2. **Campfire flickering light (`fire_light`)**: `light` layer, mode `flicker` (1), 3s cycle (4 cycles per 12s), warm light `[1.0, 0.82, 0.45]` cast across the snow, logs, and stones.
3. **Campfire flames (`flames`)**: `soft` deform layer, anchored along the bottom stone rim (`hem: -75` px), `dir: 270` (upwards), `preset: foliage` for flame flutter noise, `amp: 1.8` cells.
4. **Rising smoke wisp (`smoke`)**: `soft` deform layer along the painted curly smoke column, anchored at the campfire tip (`hem: -280` px), `dir: 270`, `preset: foliage`, `amp: 1.2` cells.
5. **Smoke particles (`smoke_particles`)**: `particles` layer, `kind: steam`, `origin: [510, 560]`, rise cycle 4s (3 per 12s loop).
6. **Person breath (`person_breath`)**: `soft` deform layer, seated on the log (`hem: -160` px), `dir: 270`, `amp: 0.4` cells, `preset: cloth`, `phase: 1.0`.
7. **Dog breath (`dog_breath`)**: `soft` deform layer along snow contact line (`hem: -55` px), `dir: 270`, `amp: 0.35` cells, `preset: cloth`, `phase: 3.5`.
8. **Dog ear flick (`dog_ear`)**: `rigid` part, pivot at ear base `[657, 622]`, `amp: -20` degrees (counter-clockwise upward twitch), `period: 6` s (2 cycles per loop), `snap: 0.22` (brisk flick, gentle return).
9. **Falling snow (`snow_particles`)**: `particles` layer, `kind: snow`, `zone` covering diorama, `density: 0.22`, `fall: 128` cells/loop.
10. **Details (`detail`)**: Person face, hands, dog face, and campfire flames (in Round 2) for sharp Bayer dither resolution.

---

## 2. Visual Checks: What I See / Is It Right

### Check 1: `overlay.png` (Grid on, every polygon drawn)
- **What I see**:
  - `flames`: Box enclosing flames from Y=565 to Y=645, base line at Y=645 sitting right on the ember base.
  - `smoke`: Purple column hugs the rising painted smoke plume from Y=245 to Y=565.
  - `person_breath`: Red polygon covers the person's torso and shoulders wrapped in the red blanket; bottom anchor line sits on the seat/log at Y=615.
  - `dog_breath`: Green polygon encloses the resting dog's flank; anchor line sits on the snow contact at Y=695.
  - `dog_ear`: Rigid cutout polygon wraps the floppy ear flap; red pivot dot sits exactly on the top ear hinge `[657, 622]`.
  - `tent_light`: Polygon traces the triangular inner opening of the tent.
  - `fire_light`: Polygon encloses the campfire and surrounding illuminated snow.
  - `snow_particles`: Bounds frame the diorama snow chunk.
- **Is it right**: Yes. Every polygon hugs the named object without guessing or clipping neighboring geometry.

### Check 2: `build/parts.png` (Contact sheet of moving parts)
- **Tile audit**:
  - `flames`: Campfire flame tongues and glowing ember base; no tent or background.
  - `smoke`: Vertical curling smoke wisp from campfire base up into the sky; no trees.
  - `person_breath`: Person wrapped in red blanket, head and hands; seated posture preserved.
  - `dog_breath`: Golden dog body and legs lying on the snow.
  - `dog_ear`: Cutout is exclusively the golden retriever ear flap on neutral grey with red pivot at the hinge; no eye, no snout, no collar.
  - `tent_light`: The warm triangular interior opening of the tent.
  - `fire_light`: Campfire stones and snow floor illuminated by firelight.
  - `smoke_particles`: Origin point marker at [510, 560] above the campfire flame peak.
  - `snow_particles`: Bounding rectangle across the scene.
- **Is it right**: Yes. Every cutout is strictly the named object.

### Check 3: `out/<part>_phases.png` (Motion strips across the cycle)
- **`dog_ear_phases.png`**:
  - At t=0.00s: Ear resting downward against head.
  - At t=1.50s: Ear perked back/up (~20° counter-clockwise rotation about pivot).
  - At t=3.00s: Peak extension easing into return stroke.
  - At t=4.50s: Settling smoothly back to resting position.
  - Behind the moving ear, the inpainting fills the dog head fur seamlessly with no tears, holes, or halos.
- **`person_breath_phases.png`**:
  - Shoulders and blanket chest rise ~0.4 cells and fall on a calm 4s period; hands remain steady over the campfire; face stays expressive without warping.
- **`dog_breath_phases.png`**:
  - Flank gently expands ~0.35 cells while paws stay anchored on the snow; out of phase (`phase: 3.5`) with the person.
- **Is it right**: Yes. Motion reads physically as intended actions at natural breathing and ear-perking tempos.

### Check 4: `out/compare.png`, `out/contact.png`, `out/contact_detail.png`
- **`out/compare.png`**: Side-by-side comparison between reference painting (left) and pocketworld at t=3s (right). The 260-cell dither preserves the diorama silhouette, warm tent interior, flickering campfire warmth, and peaceful winter campsite atmosphere.
- **`out/contact.png`**: 6 frames across the 12s loop (t=0s, 2s, 4s, 6s, 8s, 10s). Continuous illumination, smooth breathing, and seamless particle cycles without pops.
- **`out/contact_detail.png`**: 4 consecutive frames (1/60s apart). Changes crawl smoothly across the flame tips, snow, and blanket folds. No region-wide step or flicker.

---

## 3. Iteration Rounds: Issues Found & Fixes Applied

### Round 1:
- **Issues Found**:
  1. `dog_ear` sweep was `1.23 cells at the tip` (`amp: -12°`, reach 23 px). Per checklist rubric ("sweep is ≥2 cells at the tip"), the twitch was slightly too subtle to read clearly at full scale.
  2. Initial `still` polygon placed around `[614, 622]` and `[606, 434]` intersected with the face/snout boundaries. Per `SKILL.md` ("Faces. Put faces in detail, not still"), `still` froze pixels and caused edge feather blurring.
  3. Kuwahara filtering (`kuwa: 1`) smoothed the fine 1-pixel facial features (person eye dot, dog dark eye and nose) into adjacent skin tones.
  4. `fire_light` with `color: [1.0, 0.78, 0.38]` washed out the intense orange core of the campfire flames via color mixing.
  5. `smoke_particles` origin was placed at `[530, 560]`, slightly to the right of the flame peak (`[510, 560]`).
- **Fixes Applied**:
  1. Increased `dog_ear` amp to `-20°`, reaching `2.06 cells sweep at the tip` (printed by prep).
  2. Moved facial regions into `detail` and cleared `still`, restoring natural continuous shading on faces.
  3. Disabled Kuwahara pre-filtering (`kuwa: 0`, `passes: 0`, `haze: 0.25`) to preserve pixel art clarity on eyes, nostrils, hands, and flame edges.
  4. Added campfire flame region into `detail` to maintain fine dither spread on flickering fire tongues.
  5. Adjusted `fire_light` polygon and lowered `amp` to `0.10`, directing light onto surrounding snow and stone rims while keeping the central flame saturated.
  6. Adjusted `smoke_particles` origin to `[510, 560]`.
- **Evidence**: `crops/dog_t.png` vs `crops/dog_ref.png`, `crops/person_t.png` vs `crops/person_ref.png`, and `build/parts.png`.

### Round 2:
- **Visual Checks & Verification**:
  1. `out/dog_ear_phases.png` shows distinct, readable ear perking at 2.06 cells sweep with clean inpainting behind it.
  2. `crops/person_t_r2.png` and `crops/dog_t_r2.png` confirm the eye, facial profile, and dog snout are crisp and expressive.
  3. `crops/fire_t_r2.png` shows the flames are bright, warm, and jumping organically without washed-out highlights.
  4. `metrics.json` confirmed improved temporal smoothness:
     - `medianCells`: 53.0 (0.078% per frame, matching quiet diorama baseline).
     - `maxOverMedian`: 1.81 (improved from 2.14 in Round 1).
     - `seamCells`: 67 (well within the normal 24–96 range).
     - `seamWithinRange`: `true`.
- **Evidence**: `crops/person_t_r2.png`, `crops/dog_t_r2.png`, `crops/fire_t_r2.png`, `out/compare.png`, `out/metrics.json`.

---

## 4. Final Rubric Verification

- [x] **Cutouts**: `build/parts.png` confirms every tile is exclusively the named object.
- [x] **Artifacts**: No tearing, holes, halos, or specks around moving pieces or inpainted backgrounds.
- [x] **Colours**: Palette locked to 21 refined OKLab entries; saturation and chroma ≤ 1.0 (0.92 / 0.95); no black outlines.
- [x] **Faces**: Expressive, readable profile on person and dog face; kept in `detail`.
- [x] **Life**: Person breathes gently (4s period), dog breathes calmly (4s period), ear twitches periodically (6s period), campfire dances, smoke rises, snow drifts.
- [x] **Physical Motion**: Natural pivot at ear base, correct hem anchors, sensible breathing amplitudes (<0.5 cell).
- [x] **Seamless Loop**: Exactly 12.0 seconds at 60 fps (720 frames); `seamWithinRange: true` with seamCells=67 sitting inside normal range.

---

## 5. Feedback Round: User Critique & Iterative Refinement

### 5.1 User Feedback (Verbatim)
> 是的 虽然有你说的问题 但效果很不错哦！感觉进步很大哎！不错不错
> 烟是有问题但就去掉烟吧 但重点做出火焰柔和跳动变化的感觉！小狗的耳朵时不时的自然煽动可以很有生活味道！
> 更改这两点吧

---

### 5.2 Architectural & Parameter Changes

Following the working method in `skills/pocketworld/SKILL.md`:

1. **Remove Smoke (`去掉烟`)**:
   - Removed the `smoke` soft deformation layer (which warped the painted wisp).
   - Removed the `smoke_particles` steam particle generator.
   - The cold night watercolor background and tent peak above the campfire remain completely calm, clean, and artifact-free.

2. **Soft, Leaping Campfire Flame Dynamics (`火焰柔和跳动变化的感觉`)**:
   - **Full Flame Geometry**: Re-analyzed campfire flame bounds in reference (`X: [450, 559], Y: [540, 659]`). Re-anchored bottom base at `Y=648` (`line: [465, 648, 545, 648]`) and widened the polygon to cover all leaping tongues from `X=465` to `X=545` with top peak at `Y=535`.
   - **Organic Deform Motion**: Set `amp: 2.5` cells with `dir: 265°` (upward with a subtle natural drift toward the open sky) and `hem: -95` px under `preset: foliage` (providing 4s, 3s, and 2s harmonics combined with spatial noise flutter).
   - **Multi-Harmonic Dual Lighting**:
     - `fire_light`: Mode `flicker` (1), `period: 3` s (4 cycles in 12s), `amp: 0.13`, `sway: 1.8` cells wander, casting flickering amber warmth (`[1.0, 0.80, 0.42]`) across the snow and stone ring.
     - `flame_core`: Added a concentrated core light on the fire tongues: mode `flicker` (1), `period: 2` s (6 cycles in 12s), `amp: 0.11`, `color: [1.0, 0.90, 0.58]`, `blur: 6`.
     - The interference between the 3s ground light and the 2s core light produces a dynamic, non-monotonous flame flicker that jumps softly and feels alive.
   - **Refined Detail Mask**: Updated `detail` bounding box to `[[460, 535], [545, 535], [545, 650], [460, 650]]` so fine flame tongues retain sharp 4×4 Bayer dithering without edge blurring.

3. **Natural, Occasional Dog Ear Twitches (`小狗的耳朵时不时的自然煽动，生活味道`)**:
   - **Engine Support (`duty` parameter)**: Enhanced `stroke()` and `partTransforms()` in [`src/player.js`](file:///Users/tzz/Documents/pocketworld/snow_v1/repo/src/player.js) and `tools/pocketworld.py` to support an optional `duty` cycle (`0 < duty <= 1.0`). For `u < duty`, the stroke executes smoothly with C1 boundary continuity; for `u >= duty`, the part rests completely motionless (`angle = bias`).
   - **Natural Life-like Rhythm**:
     - Configured `dog_ear` with `period: 6` s, `duty: 0.16`, `snap: 0.26`, `amp: -24°` (counter-clockwise upward flick), and `phase: 0.20`.
     - **Timing**: In each 6s cycle, the flick lasts `0.16 × 6 = 0.96` seconds. For the remaining `5.04` seconds (>83% of the time), the ear rests completely still against the fur while the dog breathes peacefully.
     - The two flicks land at `t = 4.80s` and `t = 10.80s`. At `t = 0.0s` and `t = 12.0s` (the loop seam), the ear is 100% at rest, ensuring a totally invisible seam.
     - With `snap: 0.26`, the ear perks up briskly (~0.35s up-stroke) and eases back softly (~0.61s recovery), giving an endearing, realistic animal reaction.

---

### 5.3 Feedback Iteration Rounds

#### Round F1 (Feedback Round 1):
- **Issues Found**:
  1. Removing `smoke` and `smoke_particles` successfully cleaned the upper sky, but initial flame deform with `amp: 2.4` and single `fire_light` lacked secondary color pulsation in the ember core.
  2. `dog_ear` with `amp: -22°` achieved `2.26 cells sweep at the tip` and `duty: 0.18` (1.08s stroke), but the flick could be slightly crisper and the resting window even longer.
- **Fixes Applied**:
  1. Added secondary `flame_core` light at 2s period (6 cycles/12s) to create rich 2s/3s harmonic pulsation with the 3s ground light.
  2. Increased flame amplitude to `2.5` cells and tilted `dir` to `265°`.
  3. Increased `dog_ear` amplitude to `-24°` (reaching `2.47 cells sweep at the tip`), tightened `duty` to `0.16` (0.96s active, 5.04s still), and adjusted `snap` to `0.26`.
- **Evidence**: `crops/dog_ear_f1_ph1.png` and `crops/flame_t_2.0.png`.

#### Round F2 (Feedback Round 2):
- **Visual Checks & Verification**:
  1. **`build/parts.png` Tile Audit**:
     - `flames`: Encloses campfire tongues and glowing ember base; no tent, no hands.
     - `person_breath`: Red blanket torso, seated posture preserved.
     - `dog_breath`: Golden dog ribcage, resting gently on snow.
     - `dog_ear`: Golden floppy ear flap on neutral grey with red hinge pivot at `[657, 622]`; clearly displays `amp -24 deg`, `duty 0.16`.
     - `tent_light`: Triangular inner opening glow.
     - `fire_light`: Campfire snow and stone illumination.
     - `flame_core`: Inner fire tongue core light card.
     - `snow_particles`: Bounding rectangle across the diorama.
     - All smoke tiles completely gone.
  2. **`out/dog_ear_phases.png`**:
     - `ph0` (t=4.80s): Ear resting down against head.
     - `ph1` (t=5.12s): Ear perked up/back at 24° peak (sweep 2.47 cells at tip).
     - `ph2` (t=5.44s): Ear descending smoothly in relaxation.
     - `ph3` (t=5.76s): Ear settled back into resting position.
     - The inpainting in `build/fill.png` provides seamless golden head fur behind the moving ear flap (`mean color: [136.8, 95.6, 75.5]`).
  3. **Flame Dynamism & Stability**:
     - Time crops (`crops/flame_f2_t_*.png`) confirm active, soft jumping movement (13.6% to 17.6% pixel variation per second) with natural upward/leftward flame licks and golden ember breathing.
  4. **Metrics (`out/metrics.json`)**:
     - `medianCells`: 65.0 (0.096% per frame, calm diorama baseline).
     - `maxOverMedian`: 2.14.
     - `seamCells`: 69 (comfortably within normal 24–96 range).
     - `seamWithinRange`: `true`.
- **Evidence**: `crops/dog_ear_f2_ph1.png`, `crops/flame_f2_t_3.0.png`, `out/compare.png`, `out/metrics.json`.

---

### 5.4 Final Verification Checklist

- [x] **Smoke Removed**: Neither soft smoke deformation nor steam particles are present.
- [x] **Flames Soft & Leaping**: Full-width deformation (2.5 cells amp, 265° dir, foliage preset) combined with dual-frequency flicker lighting (2s core + 3s ground with 1.8 cell sway).
- [x] **Dog Ear Natural Twitches**: Enabled via `duty: 0.16` on a 6s period (0.96s flick, >5s quiet rest), sweep 2.47 cells at tip, perfectly seamless across the loop.
- [x] **Visual Clarity**: No tears, holes, halos, or artifacts; faces and flame detail preserved.
- [x] **Artifacts Rendered**: [`out/loop.mp4`](file:///Users/tzz/Documents/pocketworld/snow_v1/repo/examples/snow-campfire/out/loop.mp4), [`out/loop.gif`](file:///Users/tzz/Documents/pocketworld/snow_v1/repo/examples/snow-campfire/out/loop.gif), [`out/compare.png`](file:///Users/tzz/Documents/pocketworld/snow_v1/repo/examples/snow-campfire/out/compare.png), [`out/dog_ear_phases.png`](file:///Users/tzz/Documents/pocketworld/snow_v1/repo/examples/snow-campfire/out/dog_ear_phases.png).

