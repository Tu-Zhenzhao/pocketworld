# Watch, inspect, make it yours

The main README keeps the three-ball juggler as its opening scene. The additional gallery contains two finished, editable worlds:

| Sample | Finished review and exports | Canonical source |
|---|---|---|
| Afternoon bicycle repair / 午后修单车 | [Review](../examples/bicycle/index.html), [MP4](../examples/bicycle/loop.mp4), [GIF](../examples/bicycle/loop.gif), [component](../examples/bicycle/component.js) | [Scene](../skills/pocketworld/assets/examples/bicycle/scene.js), [base drawing and transmission](../skills/pocketworld/assets/examples/bicycle/base.js), [art decisions](../skills/pocketworld/assets/examples/bicycle/ART_DIRECTION.md) |
| Pottery by the pond / 池畔陶艺 | [Review](../examples/pottery/index.html), [MP4](../examples/pottery/loop.mp4), [GIF](../examples/pottery/loop.gif), [component](../examples/pottery/component.js) | [Scene](../skills/pocketworld/assets/examples/pottery/scene.js), [annotated studies](../skills/pocketworld/references/art-studies.md) |

These original scene sources and renders are included under the repository's MIT license. They were refined through user art direction and agent iteration. Artist reference footage, private conversations, temporary diagnostics and machine-specific paths are not part of the samples.

## Open locally

From a current main checkout, run `npm ci`, then:

```sh
node skills/pocketworld/scripts/serve.mjs examples/bicycle
# Or: node skills/pocketworld/scripts/serve.mjs examples/pottery
```

Open the printed URL. Each review includes playback, scrubbing, replay, crops, background checks and real format downloads. GitHub displays the GIF but does not run a checked-in HTML player.

## Edit and regenerate

Copy a canonical scene folder into your own workspace. After setup, run:

```sh
node skills/pocketworld/scripts/deliver.mjs skills/pocketworld/assets/examples/bicycle \
  --out /absolute/path/to/fresh-review --formats preview,video,gif,component --backend cpu
```

Use a fresh output directory. The checked-in bicycle keeps Dot's verified 576 × 576, 60 fps, 12-second final video and 20 fps GIF, with a freshly generated standard player/component using the same scene source. Its shapes are designed at 192 cells; cat/grass motion uses integer displacement on a 576-pixel output surface. Standard `deliver` currently enlarges encoded output by 3×, so a fresh full bicycle export is 1728 × 1728. This changes display dimensions, not the authored shape budget. It does not require changing the shared renderer.

For maintainers, `node tools/build-bicycle-example.mjs` rebuilds the player/component from canonical source and retains the checked-in media only after checking scene-source and media hashes. It refuses to retain media after `scene.js` or `base.js` changes; render fresh media in that case. Every review has its own file-hash manifest.

## Bring one to your site

Copy the sample's `component.js` to your site's static assets, then follow [the bicycle integration example](embedding.md#use-the-bicycle-sample). The component is transparent and independent of the review page. A draggable host is a website integration choice; dragging is not built into the scene runtime. Keep a separate drag handle so it does not interfere with links, touch scrolling or accessibility.

Prefer MP4 or the live component when judging breathing, tail motion and the wheel slowing down. The GIF is only 20 fps. Hard pixel edges can still hold briefly at motion extrema.
