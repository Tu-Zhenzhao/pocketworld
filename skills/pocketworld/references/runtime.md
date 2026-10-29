# Native runtime and restricted hosts

Rendering style and execution backend are separate. CPU draws authored native shapes directly at the scene grid; it does not restore v0.3 image reduction or cutout animation.

| Capability | Native CPU (`--backend cpu`) | Browser (`--backend browser`) |
|---|---|---|
| Standard geometry, material ramps, depth, field and pixel details | Supported | Supported with WebGL2 |
| Shipped juggler sprite/volume and ox | Supported | Supported |
| Custom Canvas2D `createRenderer` | Supported when using the documented canvas-only host | Supported |
| Arbitrary custom GLSL, DOM, external textures | Requires an explicit CPU adapter; unsupported must be reported | Depends on that custom implementation |
| Poster, MP4, GIF, component source | Supported; video/GIF need ffmpeg | Supported; video/GIF need ffmpeg |
| Interactive player/component | Generated for the viewing browser | Generated for the viewing browser |

`auto` tries browser capture and falls back to CPU with the original browser error recorded in `manifest.json`. `browser` fails strictly if unavailable. In known restricted hosts choose `cpu` immediately; it starts no browser/server/CDP and requires no network sockets while drawing. Installation downloads locked npm dependencies, which still needs network/package access. The native canvas binary must support the host OS and architecture.

Setup defaults to installing dependencies and running a real CPU geometry/motion/alpha self-test, without downloading Chrome. A discovered Chrome path does not mean Chrome can launch. Browser capture can be enabled with `setup.mjs --install-browser`; then use `doctor.mjs --backend browser`. Existing explicit CHROME is authoritative. Do not disable security policies to run Chrome.

```sh
node SKILL_ROOT/scripts/setup.mjs
node SKILL_ROOT/scripts/doctor.mjs --backend cpu
node SKILL_ROOT/scripts/deliver.mjs /absolute/scene --out /absolute/fresh-review --formats preview,video,gif,component --backend cpu
```

The same state, meshes, cell grid and palette drive both geometry paths. CPU implements software projection, depth, interpolated normal lighting, material ramps and ordered transitions. Floating-point/triangle edge/noise differences can change individual cells; do not promise pixel-identical GPU output. Preserve recognizable silhouette, contacts, palette and motion and inspect the chosen backend's actual rendered frames. Each export records its backend; never mix old outputs into a new run.

For custom renderers, `createRenderer(canvas, {backend})` must return the normal drawing/capture/lifecycle interface. CPU provides Canvas2D, `document.createElement('canvas')` and `ImageData`; it does not emulate a DOM, WebGL or a general browser. Use `SoftwareRenderer` or `TriangleRaster` from `engine/software.js` for custom native geometry. Avoid module-global DOM work and Node-only imports so browser components remain portable.

A CPU poster/video is verifiable inside the agent workspace even if the agent browser cannot access its localhost. That does not prove interactive UI access or browser video playback: distinguish frame generation, encoding, download accessibility, interactive playback and visual approval. Provide fresh outputs and diagnostics, and report unverified checks accurately.
