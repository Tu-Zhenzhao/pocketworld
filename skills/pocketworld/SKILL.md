---
name: pocketworld
description: Create and refine animated pixel dioramas from a scene idea and reference image, with native pixel characters, geometric volume, connected motion and a review player offering video, GIF or transparent web component delivery.
---

# Pocketworld 0.5.0

Author a little world at its final pixel grid. The image guides composition, palette and anatomy; construct native shapes and actions for the actual story. The calling agent performs the design and coding. Complex subjects may need several refinements.

## Start here

Treat the directory containing this file as `SKILL_ROOT`. Everything needed by the Skill is inside it. Use its actual absolute path in commands, including paths with spaces.

1. If needed, run `node SKILL_ROOT/scripts/setup.mjs`, then `node SKILL_ROOT/scripts/doctor.mjs --backend cpu`. Node20+ and native CPU rendering work without a browser; browser/WebGL2 is optional for capture, and needed by geometry components on the viewing browser; video/GIF additionally need ffmpeg. Reference generation uses the host agent's image tool, not a bundled model/API service.
2. For sentence-only input, make a design reference with the host image tool when available; use a supplied image when present. Before image generation, read [reference design](references/reference-design.md), [art direction](references/art-direction.md), relevant [drawing recipes](references/drawing-recipes.md), and [native authoring](references/native-authoring.md).
3. Copy `assets/native-starter/scene/` into a fresh workspace scene folder. The shipped `assets/examples/juggler/` and `ox-noon/` are runnable guidance for two different subjects/rendering approaches; make a new design for a new prompt.
4. Build a review: `node SKILL_ROOT/scripts/deliver.mjs /absolute/scene --out /absolute/fresh-review --formats preview`. Serve it with `node SKILL_ROOT/scripts/serve.mjs /absolute/fresh-review`.
5. Read [delivery](references/delivery.md), retain the player and let the user choose final formats. Existing choices persist. Publish only when authorized.

View an approved style anchor before reference generation; include it as the image tool's style reference when supported. Keep the user's scene open-ended, but keep the minimal visual language stable. Inspect the generated reference for overdecoration before showing it.

For restricted hosts, use `--backend cpu` on doctor/deliver. `auto` attempts browser capture then falls back to native CPU; `browser` is strict. Standard geometry and both shipped examples support CPU. Custom WebGL renderers need a CPU adapter; see [runtime support](references/runtime.md). Never change host security settings to make Chrome run.

## Design and motion

Define the view, framing/footprint, recognizable silhouette cues, hero sizes in cells, light, material ramps, action and fixed contacts. The included own-rendered anchors show the quiet visual direction. Start around orthographic azimuth45°/elevation30° (2:1 dimetric), 240–300 cells and a restrained palette; adapt to the story. Distinguish canvas resolution, occupied cells and the detail budget of a hand/face.

Make a static pose readable at native size before adding motion. Check anatomy and negative spaces against useful references. Preserve deliberate cell-wide structures. Geometry and native rasterization still require authored shapes; texture cannot repair a wrong silhouette.

Use shared state for related parts: grip → prop, jaw → grass, rod/bobber → line, contact event → ripple, light/pose → shadow. Breathing deforms connected chest/abdomen volumes between supports; a translating belly patch is insufficient. Prefer designed timelines and analytic trajectories before a general physics engine.

## Inspect, refine, deliver

- Inspect framing, silhouette and hero features at1× and integer-enlarged crops. Refine pose before texture.
- Isolate primary motion, then secondary motion. Check action extremes, adjacent frames, seam, contacts and attachments.
- Record concrete observations and at least two inspect/fix passes for a new scene. Keep remaining weaknesses visible; technical tests do not approve art.
- Preserve `assets/delivery/`: white stage, restrained title/caption, play/pause, replay, time scrub, detail crops, real synchronized alternatives, honest format choices and collapsed developer integration. Crops enlarge the same rendered frame.
- Export the chosen alternative with `--variant its-id` when necessary. Ungenerated outputs/variants show a copyable request, never an unrelated download.
- Components preserve actual alpha and foreground white. Normal MP4 is opaque; GIF uses binary transparency at20fps. Verify a component on light/dark/colored hosts.

Use Node + Playwright for repeatable UI assertions; screenshots supplement art inspection. Check actual encoded files, deterministic seeking, action-appropriate seam continuity, responsiveness and component cleanup. Check different scene bundles on one page when changing the delivery runtime. Report the installed version, preview, chosen outputs and practical limits. Package fresh source, manifests/hashes and diagnostics; exclude third-party footage and machine caches.
