# Review and delivery

Reuse `assets/delivery/`. Customize story, language, crops and actual alternatives while retaining the white stage and quiet presentation.

Keep this UI for local users. Cloud agents may render perfectly while their browser/user cannot reach workspace localhost: attach the fresh native preview, chosen MP4/GIF and downloadable review/component source package. Report interactive access as unverified there; do not block CPU export, remove local controls, promise a public URL, or repeatedly retry an inaccessible server. When the review is on a user's machine, serve it with `scripts/serve.mjs` and actually verify its controls. A cloud browser's inaccessible localhost does not imply that exported components cannot work on the user's website.

## Player

- Play/pause, replay, visible time scrub and named crops from the same native frame, integer enlarged.
- Real alternatives share time/framing; comparison appears only when alternatives exist.
- Video / GIF / transparent component choice belongs to the user. Honor choices already made.
- Download only generated files for the exported alternative. Other choices show actual status plus a copyable delivery request. Use `--variant id` to export a chosen alternative.
- Keep code and runtime details in the developer section. For embedding, a white review page is not evidence of transparent pixels.

| Format | Deliver | Actual behavior |
|---|---|---|
| Video | MP4, dimensions/fps/duration, poster | H.264/yuv420p is opaque; default composite is white |
| GIF | animated GIF with loop and declared timing |20fps/50ms frames, binary transparency, no extra diffusion dither |
| Component | standalone module, embed example, true-alpha poster, source modules | WebGL2, lifecycle API, preserved white objects |
| Review | self-contained index.html plus source/manifest alongside it | actual downloads stay next to the review |

## Embed API

```html
<div id="pocket" style="width:480px;max-width:100%"></div>
<script type="module">
  import {mount} from './component.js';
  const world=mount(document.querySelector('#pocket'), {paused:false});
</script>
```

The bundle exports `mount`, `tagName` and `PocketworldScene`. Tags are deterministic per source, scene and selected variant so different worlds/variants can share a page. Use the exact generated tag in `embed.html` for declarative markup.

Default output is transparent; `opaque` requests white. Methods: `play()`, `pause()`, `replay()`, `seek(seconds)`, `destroy()`. Offscreen/hidden/reduced-motion handling must preserve explicit pauses. Detaching cleans RAF, observers, listeners and rendering resources; reconnecting recreates them.

Standalone bundles import embedded `data:` modules. Hosts with stricter CSP can import `component-module.js` with its `engine/` and `scenes/` at their generated relative paths. Serve through HTTP(S). Some platforms strip scripts/custom elements: offer GIF/video there instead of promising every web host can run custom JavaScript.

## Verify

Node + Playwright: controls, deterministic seek, mobile layout, variant-specific downloads and lifecycle. The alpha fixture must contain an opaque white object. Check on light/dark/colored hosts, clear old pixels on backward seeks, detach/reconnect, and mount two different scene bundles together.

Inspect encoded video playback/frame count and GIF timing/transparency/white. Keep source, fresh outputs and manifest. `status:generated` means artifacts were generated; it does not declare an aesthetic approval. Avoid browser binaries, machine-local paths and third-party footage in packages.

Implementation references: [WebGL clear alpha](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/clearColor), [custom element lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements), [FFmpeg palette filters](https://ffmpeg.org/ffmpeg-filters.html#palettegen).
