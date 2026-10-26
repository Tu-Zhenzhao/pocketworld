# Agents

Read `skills/pocketworld/SKILL.md` before you add or retune a scene. It is the whole workflow: a reference painting, `scene.json`, prep, then the shader. `skills/pocketworld/spec.md` is the look. `skills/pocketworld/reference-prompt.md` is the image prompt. `skills/pocketworld/checklist.md` is the list you finish.

The default mode is from-reference. Do not draw figures with SDFs. That experiment is in `experimental/sdf/` and it is not the product.

Runtime code is `src/`. Prep is `tools/pocketworld.py`, driven by `node cli/pocketworld.js`. Scenes are `examples/*/scene.json` plus `reference.jpg`.

```bash
node cli/pocketworld.js prep examples/rain-bus-stop
node cli/pocketworld.js render examples/rain-bus-stop
node cli/pocketworld.js dev
```

`index.js` does not register `<pocket-world>`. The element is `src/element.js`.

Do not commit study videos. Do not commit someone else's footage. The approved loops in `examples/*/out/` are renders from this repo.
