# Make a Pocketworld

An agent starts with your scene description and a supplied or generated reference image. The reference establishes composition, mood and anatomy; the scene's native pixel shapes and motion are authored separately.

## Fast path

Read the [Skill](../skills/pocketworld/SKILL.md), [art direction](../skills/pocketworld/references/art-direction.md) and relevant [subject recipes](../skills/pocketworld/references/drawing-recipes.md). Use the installed Skill's `assets/native-starter/scene/` for a fresh scene, or learn the adapter from `assets/examples/juggler/` and `ox-noon/`.

In a repository checkout:

```sh
npm ci
npm run setup -- --install-browser
npm run doctor
node cli/pocketworld.js init my-scene
# Edit my-scene/scene.js and delivery.json for the user's actual story.
node cli/pocketworld.js render my-scene --out my-review --formats preview
node cli/pocketworld.js dev my-review
```

For an installed Skill, copy the starter folder to your workspace and call its `scripts/deliver.mjs` / `scripts/serve.mjs` directly. No repository files outside the Skill are needed.

## Design before motion

Record the intended view, footprint, silhouette cues, subject sizes in cells, palette/light and fixed contacts. Start around240–300 cells with a restrained palette, then adapt to the story. Check the subject at native size before animating it. People and animals need purposeful anatomy; props need connected thin structures; textures support the forms.

Give interacting parts a common state: hand and ball, jaw and grass, contact and ripple. Breathing changes a continuous supported volume. Inspect stills, action extremes, adjacent frames and the loop seam; refine with concrete observations.

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

Video/GIF need ffmpeg. The component needs WebGL2 and a host that allows scripts; [embedding](embedding.md) covers both standalone and module source.
