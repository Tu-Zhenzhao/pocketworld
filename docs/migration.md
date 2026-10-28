# Moving to 0.4.0

0.4.0 replaces the reference-image raster pipeline with native pixel scene authoring. The old `prep`, `overlay`, `suggest`, CPU renderer, `<pocket-world>` element, experimental SDF rig and raster examples were removed from the current package.

Their complete history is preserved at the [0.3 snapshot](https://github.com/Tu-Zhenzhao/pocketworld/tree/89bdfb0be0a517f62ca7b99a5f483e8bb5c1b5e0). Stay on that commit if you need to reproduce an old `scene.json` pipeline; those scene files do not run in the new engine unchanged.

For new work, follow [installation](../INSTALL.md), author a native `scene.js` plus `delivery.json`, and use the new review/export helper. References guide the design; the new scene is authored at its final grid. Generated components export `mount` and `tagName`; copy their current `embed.html` rather than reusing the old element.

The runtime no longer needs Python. Chrome/WebGL2 is required for rendering, ffmpeg for video/GIF, and the installed Skill ships all other scene tooling. Updates through the new installer preserve a backup of a recognized prior Skill.
