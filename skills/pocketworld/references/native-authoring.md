# Native authoring

This is a scene toolkit used by the calling agent, not an image reconstruction model. It requires a browser with WebGL2. If the host cannot render, retain source/diagnostics and report the preview as unverified; do not silently substitute raster pixelation.

## Default scene adapter

Scene folder: `scene.js`, optional configuration modules, `delivery.json`. The helper copies it into `scenes/current/` and supplies `engine/`. Import `../../engine/math.js`, `mesh.js`, `pixels.js` as needed; these paths are resolved in the generated output.

```js
export default {
  config,                     // id, title, grid, loop, fps, camera, palette, materials, light
  state(time, options),       // pure deterministic state, including .time
  geometry(state),            // Float32Array: x,y,z,nx,ny,nz,materialIndex for each vertex
  details(ctx,state,zoom,options) // optional native pixel pass; preserve alpha
};
```

Give `config.id` a lowercase ASCII slug starting with a letter, maximum48 characters. Caption/title/labels can use the user's language. For the default renderer choose a positive integer grid/fps and a loop with an integer frame count. Camera uses orthographic azimuth/elevation/span/target. Materials reference ordered palette ramps: at most12 materials and64 ramp entries. `mesh.js` supplies primitives; custom vertices work as well. `finish()` transforms must rotate around origin because normals use the same callback; apply translations while constructing vertices.

Optional material0 `config.field` gives an elliptical meadow: `radii`, optional `angle` in degrees (default0) and `shadow:{center,radii,strength}`. It is a simplified contact field, not shadow mapping. Other footprints can use authored meshes/coverage. PixelPen accents must follow their objects and respect visible surfaces; an unbounded overlay can violate occlusion.

## Scene-owned renderer

Native sprites, geometry and their combinations can also expose `createRenderer(canvas)` instead of `geometry`. This returns an independent object with `canvas`, 2D `ctx`, `draw(time, options)`, `capture(integerScale)`, and idempotent `destroy()`. Draw clears stale pixels, preserves alpha and accepts `opaque`; capture returns base64 PNG. Each mount owns resources and state. The juggler example demonstrates a native character with geometric scenery/shadows; the ox scene uses the default geometry renderer. Both use exactly the same review/export/component path.

Do not borrow one rig for every species or preload the shipped example as a replacement for the requested story.

## Delivery metadata

```json
{
  "title":"My scene",
  "caption":"One line about the action.",
  "language":"en",
  "focus":[{"id":"hands","label":"Look closer","rect":[30,80,80,80]}],
  "variants":[{"id":"final","label":"Current design","options":{}}]
}
```

Crops are integer native cells inside the frame. `whole` is reserved. Alternatives must be real; they share time and framing. `language:"en"` uses English controls; omitted language uses Chinese. Export defaults to the first alternative. `--variant id` selects and moves a named alternative to first position so all selected exports agree.

## Run from an installed Skill

Replace `SKILL_ROOT` with its actual absolute path:

```sh
node SKILL_ROOT/scripts/setup.mjs --install-browser
node SKILL_ROOT/scripts/doctor.mjs
node SKILL_ROOT/scripts/deliver.mjs /absolute/scene --out /absolute/fresh-review --formats preview
node SKILL_ROOT/scripts/serve.mjs /absolute/fresh-review
# Once the user chooses:
node SKILL_ROOT/scripts/deliver.mjs /absolute/scene --out /absolute/fresh-delivery --formats video,gif,component --variant final
```

Fresh output directories prevent stale success. Current bundling supports static relative JavaScript imports, not cycles, dynamic imports or external textures. Preview captures a poster without encoding the whole loop. Video/GIF need ffmpeg (`FFMPEG_PATH` override); GIF duration must be a multiple of50ms. MP4 explicitly composites white before encoding. Generated files/hashes and selected variant appear in `manifest.json`; actual media must be checked before handoff.
