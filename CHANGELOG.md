# Changelog

## 0.5.0 — 2026-10-29

- Native CPU export for standard geometry, material ramps, contact fields and pixel details, plus both juggler representations and the redesigned ox. Browser capture remains available; auto records browser failures and falls back without reverting to image pixelation.
- Canvas-only custom renderers can run in the Node canvas host; custom WebGL requires a CPU adapter and unsupported scenes fail explicitly. Manifest records the actual backend.
- Setup verifies real CPU geometry, motion and alpha; no browser download by default. Writable scoped npm cache avoids reliance on writable home directories.
- Reference generation now views and supplies approved sparse style anchors, with a reusable minimal prompt and checks against overdecorated storybook illustrations.
- Preserved review player, details, variants, alpha components and regenerated examples; added CPU/GPU silhouette and browserless export regression tests.


All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-10-28

### Added

- Native pixel authoring with geometry, designed pixel characters and shared action state; subject-specific art guidance and visual anchors.
- The three-ball juggler as the main runnable GIF/video/component example, plus a newly designed buffalo-and-shepherd scene and a minimal starter.
- A portable Skill installer with dependency lockfiles, browser setup, doctor, real smoke-test instructions and backed-up updates.
- A reusable review player with detail crops, synchronized alternatives, honest format selection and explicit variant export.
- True-alpha components preserving white objects, deterministic independent tags for multiple worlds on one page, lifecycle cleanup and a simple `mount` API.
- Clean installation, actual encoded media, component and cross-scene regression checks; release archives with hashes.

### Changed

- README now leads with the scene, the single agent installation link and ways to share or embed a world; Chinese README and focused agent/developer documentation accompany it.
- New scene rendering requires Chrome/WebGL2; video/GIF encoding uses ffmpeg. Python is no longer a runtime dependency.

### Removed

- The v0.3 raster conversion/CPU pipeline, old cutout instructions, old raster examples and archived generic SDF experiments from the current package. The previous commit remains linked in the migration guide.

## [0.3.0] - 2026-10-28

### Added

- Vectorized NumPy renderer for rain, laundry and all generic motion categories, with SwiftShader-compatible sine/hash math, texture sampling, parent transforms, duty/snap and loop wrapping.
- `render --backend auto|cpu|browser`, fingerprinted resumable `--frames a:b`, ten-frame `--smoke`, and automatic stale-build detection / `--force-prep`.
- Inline browser capture without a server or network requests, bounded launch retries with temporary profiles, `CHROME_FLAGS`, and legacy `--server` mode.
- `doctor [--json]` with staged environment, CPU, browser and encoding probes; `parity` with difference images and a 0.02% cell gate; parity CI.
- Bundled imageio-ffmpeg encoding with system fallback; browser-free GIF/PNG diagnostics when no encoder exists.
- Staged output publication, artifact hashes, latest-attempt status and failure/timeout cleanup; motion phase sheets for every profile.

### Fixed

- CPU matrix orientation, ripple index modulo, flicker noise coordinates, architecture-specific float32/FMA hash behavior, palette matching and time wrapping.
- Failed renders no longer report old artifacts as a successful current run; spawn/encode errors terminate with nonzero status.

## [0.2.0] - 2026-10-27

### Added

- **Lake Boat Living Diorama (`examples/lake-boat`)**:
  - A tranquil twilight lake diorama featuring an elderly fisherman in a weathered wooden boat.
  - Multi-harmonic water waves and surface shimmers across three seamless lake zones.
  - Delicate bamboo fishing rod with subtle trembling and bite flick via `rigid` rotation with `duty` cycle and `snap` easing.
  - Soft torso breathing, tree foliage sway, warm flickering bow lantern light, and lazily drifting fireflies (`particles`).
  - Added to playground preview (`playground/index.html`) and documentation (`README.md`).

- **Composition & Footprint Variety**:
  - Dioramas are no longer restricted to rigid square island blocks. While maintaining the signature 2:1 dimetric perspective on a clean white page (`#FFFFFF`), scenes can now adopt natural footprints:
    - Square island blocks (curbs, courtyards, bus stops)
    - Long horizontal or diagonal strips (piers, riverbanks, sidewalks)
    - Short narrow slices (doorways, window nooks)
    - Small round stages or floating circular platforms (performers, stages)
    - Open soft vignettes that gently fade and dissolve into white paper without hard geometric boundaries (`lake-boat`, `snow-campfire`).
  - Updated agent skills (`skills/pocketworld/SKILL.md`, `reference_prompt.md`), `AGENTS.md`, and CLI templates.

- **Reference-Image Verification & Prompt Generator CLI**:
  - Added `node cli/pocketworld.js check-ref <image>` to validate reference images against the pocketworld contract (1:1 square canvas, clean white margins, low-saturation refined watercolor palette, balanced luminance).
  - Added `node cli/pocketworld.js prompt "<concept>"` to generate tailored, style-compliant image generation prompts offering flexible composition footprints.

- **Generic Erase / Inpaint Polygon Support**:
  - Added support for arbitrary `erase` polygon arrays in `scene.json` to seamlessly inpaint unwanted static reference artifacts (e.g. frozen smoke plumes or foreign objects) using iterative multi-scale Poisson reconstruction.

## [0.1.0] - 2026-10-27

First public release of **pocketworld**: turn reference paintings into living, breathing dithered dioramas using a single WebGL2 shader, an OKLab palette, and an ordered Bayer dither.

### Features

- **Reference-image-as-base layers profile**:
  - The reference painting serves as the ground-truth base layer. Figures and scenes are never crudely redrawn with math or SDFs.
  - Moving parts are cleanly cut out and sampled through inverse coordinate transforms, with automated multi-scale Poisson/diffusion inpainting filling holes behind them.
- **Physical motion categories**:
  - `soft`: Smooth coordinate warping for cloth, foliage, grass, and subtle breathing.
  - `rigid`: Pivot-based rotation with configurable amplitude, bias, `snap` easing (fast outbound stroke, soft return), hierarchical `parent` kinematic chaining, and `duty` cycle control (fractional stroke execution with motionless resting intervals).
  - `path`: Small 2D trajectory loops (radius-based figure-eight or circular motion).
  - `particles`: Environment emitters for falling rain, drifting snow, and rising steam.
  - `waves`: Water surface shimmers and periodic ripples.
  - `light`: Ambient breathing, campfire/candle flicker, specular glints, and swinging shadow projection.
- **Render & Tooling CLI (`cli/pocketworld.js`)**:
  - `prep`: Palette extraction (OKLab k-means with locked key colours), mask rasterization, continuous base / inpaint generation, and diagnostic linting.
  - `render`: Automated 60 fps frame capture via headless Chrome and ffmpeg compilation into seamless MP4 and animated GIF, accompanied by side-by-side comparison (`compare.png`), contact sheets (`contact.png`, `contact_detail.png`), and temporal smoothness metrics (`metrics.json`).
  - `overlay` & `suggest`: Grid-guided polygon alignment and automated palette / cloth / wet mask proposals.
  - `phases`: Multi-phase zoomed diagnostic contact strips for moving components across their cycles.
- **`<pocket-world>` Web Component**:
  - Lightweight custom element (`src/element.js`) wrapping the WebGL2 player.
  - Zero external runtime dependencies, automatic off-screen pause via `IntersectionObserver`, and `prefers-reduced-motion` compliance.
- **Agent Skill & Iterative Workflow (`skills/pocketworld`)**:
  - Step-by-step agent instructions (`SKILL.md`), look spec (`spec.md`), checklist (`checklist.md`), and reference prompt generator (`reference-prompt.md`).
  - Strict "look, critique, fix" working method with mandatory gates: `build/parts.png` cutout audit and `out/<part>_phases.png` phase-strip validation.
  - Failures gallery (`skills/pocketworld/failures/`) documenting known visual artifacts and fixes.
- **Living Diorama Examples**:
  - `rain-bus-stop`: Rainy bus stop with lamp glow, dripping roof, ripples, umbrella sway, and breathing passenger.
  - `rooftop-laundry`: Sunny rooftop with fluttering laundry, cat breath, shadows, and floating motes.
  - `chess-under-tree`: Generic layers profile with swaying foliage, falling leaves, forearm-and-fan hierarchical rotation, and breathing players.
  - `snow-campfire`: Winter diorama featuring leaping campfire flames, dual-harmonic flicker light, gentle breathing, drifting snow, and occasional dog ear flicks using rigid `duty` cycles.

### Known Limitations

- **Flames have no dedicated category yet**: Currently approximated using `soft` deform with `foliage` flutter combined with dual `flicker` light layers.
- **Occasional motion is periodic, not random**: All cycles must divide the 12-second seamless loop; occasional motions (like an animal ear twitch) repeat at exact periodic intervals rather than true stochastic triggers.
- **Agents sometimes don't follow every instruction**: Autonomous agents may require gate enforcement (`REPORT.md`, parts sheet verification) to ensure strict adherence to visual fidelity and rubric standards.
