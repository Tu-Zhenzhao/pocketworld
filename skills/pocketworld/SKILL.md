---
name: pocketworld
description: Create and refine animated pixel dioramas from a scene idea and reference image, with native pixel characters, geometric volume, connected motion and a review player offering video, GIF or transparent web component delivery.
---

# Pocketworld 0.6.0

Author a little world at its final pixel grid. The image guides composition, palette and anatomy; construct native shapes and actions for the actual story. The calling agent performs the design and coding. Complex subjects may need several refinements.

## Start here

Treat the directory containing this file as `SKILL_ROOT`. Everything needed by the Skill is inside it. Use its actual absolute path in commands, including paths with spaces.

1. If needed, run `node SKILL_ROOT/scripts/setup.mjs`, then `node SKILL_ROOT/scripts/doctor.mjs --backend cpu`. Node20+ and native CPU rendering work without a browser; browser/WebGL2 is optional for capture, and needed by geometry components on the viewing browser; video/GIF additionally need ffmpeg. Reference generation uses the host agent's image tool, not a bundled model/API service.
2. For sentence-only input, make a design reference with the host image tool when available; use a supplied image when present. Before image generation, read [reference design](references/reference-design.md), [art direction](references/art-direction.md), relevant [drawing recipes](references/drawing-recipes.md), and [native authoring](references/native-authoring.md).
3. Before authoring, view the relevant [annotated studies](references/art-studies.md). Copy `assets/pixel-starter/scene/` for direct cell drawing or `assets/native-starter/scene/` for geometry into a fresh workspace. Juggler, ox and pottery show different subjects/approaches; make a new design for a new prompt.
4. Build a review: `node SKILL_ROOT/scripts/deliver.mjs /absolute/scene --out /absolute/fresh-review --formats preview`. Serve it with `node SKILL_ROOT/scripts/serve.mjs /absolute/fresh-review`.
5. Read [delivery](references/delivery.md), retain the player and let the user choose final formats. Local users can open a served review. When a cloud agent's localhost is unreachable, send the actual poster/GIF/video and downloadable review package; interactive access is a separate check, not a prerequisite to export. Existing choices persist. Publish only when authorized.

View an approved style anchor before reference generation; include it as the image tool's style reference when supported. Keep the user's scene open-ended, but keep the minimal visual language stable. Inspect the generated reference for overdecoration before showing it.

For restricted hosts, use `--backend cpu` on doctor/deliver. `auto` attempts browser capture then falls back to native CPU; `browser` is strict. Standard geometry and shipped examples support CPU. Custom WebGL renderers need a CPU adapter; see [runtime support](references/runtime.md). Never change host security settings to make Chrome run.

## Design and motion

Extract the story, identity cues, supports and contact events from the input. Preserve explicit user constraints; otherwise redesign clutter, overlaps and framing for a little world instead of tracing every detail. Record these decisions in the starter's `ART_DIRECTION.md`, including which actual study image was viewed and what it changed.

Choose the actor/head/hand/prop budgets first, then canvas/framing. A starter's grid is not a quality target. Start the view near orthographic azimuth45°/elevation30° (2:1 dimetric) when useful, with a restrained palette. Distinguish canvas resolution, occupied cells and feature budgets; do not impose one grid on every story.

Make a static pose readable at native size before adding motion. Check anatomy and negative spaces against useful references. Preserve deliberate cell-wide structures. Geometry and native rasterization still require authored shapes; texture cannot repair a wrong silhouette.

Keep a real silhouette and major-value intermediate. If identity/contact is unclear, revise contour, gaps, occlusion, neighboring values or local pose before texture/animation. Increase a budget only for a named remaining failure after structural changes. These are agent review gates, not requests for repeated user approval. For direct drawing prefer `engine/pixels.js`; integer vertices and `imageSmoothingEnabled=false` do not disable Canvas path antialiasing.

Use shared state for related parts: grip → prop, jaw → grass, rod/bobber → line, contact event → ripple, light/pose → shadow. Breathing deforms connected chest/abdomen volumes between supports; a translating belly patch is insufficient. Prefer designed timelines and analytic trajectories before a general physics engine.

## Inspect, refine, deliver

- Inspect framing, silhouette and hero features at1× and integer-enlarged crops. Refine pose before texture.
- Isolate primary motion, then secondary motion. Check action extremes, adjacent frames, seam, contacts and attachments.
- Use `node SKILL_ROOT/scripts/study.mjs /absolute/scene --out /absolute/fresh-study --times 0,2.3,2.3166667,12` to save real native frames, integer crops and factual statistics without a browser. Pick times from this scene's action. A coarse still does not validate motion: recheck silhouette continuity through extremes. See [studies and checks](references/art-studies.md).
- Record concrete observations and at least two inspect/fix passes for a new scene. Keep remaining weaknesses visible; technical tests do not approve art.
- Preserve `assets/delivery/`: white stage, restrained title/caption, play/pause, replay, time scrub, detail crops, real synchronized alternatives, honest format choices and collapsed developer integration. Crops enlarge the same rendered frame.
- Export the chosen alternative with `--variant its-id` when necessary. Ungenerated outputs/variants show a copyable request, never an unrelated download.
- Components preserve actual alpha and foreground white. Normal MP4 is opaque; GIF uses binary transparency at20fps. Verify a component on light/dark/colored hosts.

Use Node + Playwright for repeatable UI assertions; screenshots supplement art inspection. Check actual encoded files, deterministic seeking, action-appropriate seam continuity, responsiveness and component cleanup. Check different scene bundles on one page when changing the delivery runtime. Report the installed version, preview, chosen outputs and practical limits. Package fresh source, manifests/hashes and diagnostics; exclude third-party footage and machine caches.
