# Afternoon bicycle repair

Created with Dot in a restricted cloud environment, refined through user feedback. These are our own authored shapes and renders, contributed under the repository's MIT license.

The final direction came from the actual miniature composition reference: a small central group, a wider paved patch, quiet moss edges, and a comfortable oblique view. An earlier view was too overhead; green clothing merged with grass. The approved version uses blue-gray trousers and a warm brown cap against pale ground. The person stands behind the inverted bicycle, reaching between its wheels. A short crank remains attached to the central bottom bracket; anatomy must accommodate that fixed structure.

The main action is looking toward the front wheel, turning the crank, watching the rear wheel coast down, then looking back. Rear tire marks and spokes share the wheel angle. Frame, axles, supports and front wheel remain stable. Cat breathing, occasional ear/tail movement and a short gust provide secondary life.

`base.js` authors the scene at 192 × 192 cells. `scene.js` presents it at 576 × 576, retaining the original block shapes while sampling cat/grass displacement at integer output pixels. This is a scene-specific motion treatment, not a new universal grid recommendation. It uses no blurred edges or photograph quantization. Hard edges can still hold briefly at movement extrema; a 20 fps GIF cannot represent all the timing of the 60 fps video/live component.

Inspect/fix history: side-squatting anatomy and misplaced pedal → standing behind the central crank; excessive overhead view/green-on-green → lower oblique view and separated values; tire visually static → trackable pixel marks; coarse-grid cat/grass holds → finer output displacement with fixed supports. Those lessons informed this artwork; numeric validity alone did not establish its appearance.

The repository's annotated pottery studies remain the primary step-by-step teaching material. This bicycle is a finished additional sample, not evidence that arbitrary anatomy or input images work automatically.
