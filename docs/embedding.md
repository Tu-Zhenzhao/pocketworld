# Put a little world on your website

Choose **transparent web component** in the review UI, or export with `--formats component`. Copy the generated `component.js` to your website. It contains the scene and its JavaScript dependencies; no Node modules, image service or API key is needed by the visitor.

```html
<div id="pocket" style="width:480px;max-width:100%;background:#e7dcc9"></div>
<script type="module">
  import { mount } from './component.js';
  const world = mount(document.querySelector('#pocket'));
  // world.pause(); world.play(); world.replay(); world.seek(2);
</script>
```

`mount(container, {paused, opaque})` returns a custom element. Background is transparent unless `opaque:true` requests white. Set width on the host container and use integer multiples of the native grid where practical. Native pixels remain unsmoothed; extreme host resizing can change their apparent size.

## Use the bicycle sample

Copy [`examples/bicycle/component.js`](../examples/bicycle/component.js) to your website, for example as `/worlds/bicycle.js`:

```html
<div id="bicycle-world" style="width:384px;max-width:100%"></div>
<script type="module">
  import { mount } from '/worlds/bicycle.js';
  const bicycle = mount(document.querySelector('#bicycle-world'));
</script>
```

It runs without the review UI, a backend or an API key. If your site already has a draggable widget, mount the world inside that widget's content area and keep the existing drag handle. Dragging belongs to the host website; the scene supplies animation and playback controls. Keep the source [sample notes](samples.md) with your project if you want to edit the artwork later. Sites with strict CSP can use the unbundled files described below.

## Two different worlds on one page

```html
<div id="performer"></div><div id="meadow"></div>
<script type="module">
  import { mount as performer } from './juggler/component.js';
  import { mount as meadow } from './ox-noon/component.js';
  const a = performer(document.querySelector('#performer'));
  const b = meadow(document.querySelector('#meadow'), {paused:true});
</script>
```

Each bundle exports `tagName`, a deterministic custom-element name derived from the scene, source and selected variant. Different bundles do not overwrite each other. For declarative markup, copy the exact generated tag from `embed.html`.

The element exposes `play()`, `pause()`, `replay()`, `seek(seconds)`, `destroy()`. Boolean attributes are `paused` and `opaque`. Hidden/offscreen instances stop scheduling animation; reduced motion starts them paused unless explicitly played. Detaching cleans resources; reconnecting creates a fresh renderer. Handle a `sceneerror` event if WebGL2 is unavailable. Performance depends on scene complexity and device.

## Files and hosting

- `component.js`: standalone module; imports embedded `data:` JavaScript modules.
- `embed.html`: working example on colored hosts.
- `component-module.js` + `engine/` + `scenes/`: the same source as ordinary relative modules. Keep all three at the generated paths and import `mount` from `component-module.js` if your CSP disallows `data:` scripts.
- `poster.png`: true-alpha still for a fallback; foreground white is preserved.
- `index.html`: self-contained review page. Its UI/downloads use the other delivered files alongside it.

Serve component examples through HTTP(S), not `file://`. JavaScript must be enabled and permitted by the host/CSP. Environments that strip scripts or custom elements can use the delivered GIF/video instead. Ordinary H.264 MP4 has an opaque background; GIF uses binary transparency at20fps and will not match every subtle live animation.
