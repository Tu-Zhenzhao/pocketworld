# Make a Pocketworld

An agent starts with your scene description and a supplied or generated reference image. The reference establishes composition, mood and anatomy; the scene's native pixel shapes and motion are authored separately.

## Fast path

For a sentence-only request, the agent can first make a design reference with its image tool; supplied images go directly into that design stage. See [reference design](../skills/pocketworld/references/reference-design.md). Read the [Skill](../skills/pocketworld/SKILL.md), [art direction](../skills/pocketworld/references/art-direction.md) and relevant [subject recipes](../skills/pocketworld/references/drawing-recipes.md). Use the installed Skill's `assets/native-starter/scene/` for a fresh scene, or learn the adapter from `assets/examples/juggler/` and `ox-noon/`.

In a repository checkout:

```sh
npm ci
npm run setup
npm run doctor
node cli/pocketworld.js init my-scene --template pixel
# Use --template geometry for projected volume (the existing default).
# Edit my-scene/scene.js and delivery.json for the user's actual story.
node cli/pocketworld.js render my-scene --out my-review --formats preview
node cli/pocketworld.js dev my-review
```

For an installed Skill, copy the starter folder to your workspace and call its `scripts/deliver.mjs` / `scripts/serve.mjs` directly. No repository files outside the Skill are needed.

## Design before motion

Extract the story, identity cues and support/contact relationships; preserve explicit user constraints and redesign incidental clutter/overlaps for readability. Choose actor/head/hand/prop sizes in cells before choosing canvas/framing. A starter's resolution is not a target. View the [annotated native studies](../skills/pocketworld/references/art-studies.md), then save actual silhouette and major-value drafts before detailed motion. If a feature is unclear, revise structure before adding texture or cells.

Give interacting parts a common state: hand and ball, jaw and grass, contact and ripple. Breathing changes a continuous supported volume. Inspect stills, action extremes, adjacent frames and the loop seam; refine with concrete observations.

```sh
node cli/pocketworld.js study my-scene --out my-study --times 0,2.3,2.3166667,12
```

This browser-free helper saves native PNGs, integer enlargements/crops and facts in `study.json`; `study.html` is an optional local gallery. Select actual times within your scene's loop. Statistics do not assess beauty. The pottery lesson includes a full-loop connectivity check and the real neck-gap failure it catches. Author scene-specific semantic assertions for other subjects; a fixed mask is not a universal rig.

## Scene contract

See [native authoring](../skills/pocketworld/references/native-authoring.md) for the complete adapter, material limits, renderer extension and delivery metadata. Geometry uses `Float32Array` vertices. A scene-owned renderer can preserve a designed native sprite/geometry representation while implementing the same drawing, capture and cleanup contract.

`delivery.json` names real alternatives, their options, language (`en` or default Chinese) and integer native-cell crops. Every scene has a short lowercase ASCII `config.id`; captions and labels can use the user's language. Do not read arbitrary assets at runtime in a standalone build: the current bundler handles static relative JavaScript modules, not dynamic imports, textures or cyclic graphs.

## Deliver the chosen result

```sh
node cli/pocketworld.js render my-scene --out delivery --formats video,gif,component
# Export a named alternative when the user chose it:
node cli/pocketworld.js render skills/pocketworld/assets/examples/juggler \
  --out volume-delivery --formats component --variant volume
```

Use a fresh output directory. The helper refuses to overwrite an existing result. It captures new RGBA frames and lists actual files/hashes in `manifest.json`. Review that manifest and verify encoded output before handoff. A generated artifact is not an aesthetic approval.

Video/GIF need ffmpeg. Exports use integer scaling; odd native grids use ×4 so H.264 output dimensions stay even. The component needs WebGL2 and a host that allows scripts; [embedding](embedding.md) covers both standalone and module source.

In browser-restricted environments add `--backend cpu` to doctor and render/deliver. CPU preserves native geometry, palette and actions; it never quantizes a reference. See [capabilities and custom adapters](../skills/pocketworld/references/runtime.md).

Cloud localhost can be unreachable from the user's or agent's browser. Inspect actual PNGs in the workspace and send media plus the review package. Local users still serve and open the full player. Distinguish successful rendering/encoding from verified browser access; do not require publishing a website just to deliver an animation.
