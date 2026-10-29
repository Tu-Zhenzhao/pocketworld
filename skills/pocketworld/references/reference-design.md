# From an idea to a design reference

The user chooses the story; keep Pocketworld's approved visual language stable across stories. Before invoking the host image tool, read this contract and **view** an included style anchor with the host's image-view tool. Supply an anchor as a style-reference image when the image tool supports it. Adjectives such as “pixel art” alone previously produced overly ornate illustrations.

Use [minimal world studies](../assets/style-anchors/minimal-worlds.png) for sparseness across subjects, and [native role](../assets/style-anchors/native-role.png) / [geometric volume](../assets/style-anchors/geometric-volume.png) for authored clusters and volume. These are our own images. Reference their visual language, not their scene inventory. An explicit user request for a different style takes precedence.

## Approved style

- Quiet, minimal miniature on pure white with generous negative space; full action envelope visible. Start with orthographic azimuth45° / elevation30°, adjusting framing for readable contacts. No automatic sky or horizon.
- One readable hero and action, essential supports/props, compact story-specific footprint. Beauty comes from silhouette, spacing, proportion and a restrained accent, rather than decorative abundance.
- Muted natural palette, coherent key light and a few deliberate light/middle/shadow clusters. Native-looking square cells, anonymous small faces, purposeful tiny identity marks. Name the actor/hand/prop cell budgets; canvas resolution alone is insufficient.
- Do not add ornamental gardens, flowers, walls, shelves, elaborate textiles, intricate faces, scenic panoramas or thick floating blocks unless the actual story needs them. Keep large quiet areas. Restrained texture may support shape; it cannot replace it.

## Image-tool prompt scaffold

Adapt the brackets to the user's subject. Include the visual anchor as a style reference, not as an edit target:

> A quiet, minimalist Pocketworld design reference of [user's scene]. Match the attached approved style anchor's sparseness, apparent pixel scale, restrained geometric volume and muted natural palette; do not copy its subject. Pure white background, generous empty margins, complete small world in a comfortable orthographic three-quarter view near45° azimuth /30° elevation. [One hero, readable posture and primary action]. Keep only [essential props/supports] on [story-specific compact ground footprint]. Deliberate square pixel clusters and clear stepped silhouettes, a few quiet light/middle/shadow planes, one coherent key light. [Actor size and important feature sizes in cells; meaningful negative spaces]. [Named hand/foot/prop contact points]. No horizon, decorative scenery, ornate storybook detail, intricate faces or textiles, noisy surface filling, smooth plastic voxel blocks, text or watermark. Build elegance through spacing and shape, not extra objects.

Review the result before presenting it: is it as quiet as the actual anchor, does it read at thumbnail size, are actor/prop silhouettes and contacts clear, did invented ornaments increase density? If it looks like an elaborate illustration with pixel edges, reduce object inventory/detail density and regenerate. Lower saturation alone does not fix this failure. Do not claim exact cell compliance from image generation; author it at the true native grid later.

## Reference to native scene

For a sentence-only request, generate a design reference with the host image tool when available. For a supplied image, preserve the user's story, pose and useful palette while redesigning for the native grid. Do not demand another upload when the agent can progress. If image generation is unavailable, make an authored blockout, explain the missing reference step and continue.

A reference can be large. It is a design guide, **never the final raster substrate**: subsequently author shapes and motion at native resolution. Do not shrink/quantize an illustration and animate cutouts. Review the native static pose separately from the reference, record defects and refine before detailed animation. Technical export success does not establish visual approval.
