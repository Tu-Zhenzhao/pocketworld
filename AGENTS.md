# Agents

Read `skills/pocketworld/SKILL.md` before you add or retune a scene. It is the whole workflow: a reference painting, `scene.json`, prep, then the shader. `skills/pocketworld/spec.md` is the look. `skills/pocketworld/reference_prompt.md` is the image prompt guide. `skills/pocketworld/checklist.md` is the list you finish.

## Step 0: Reference Image Standard

Pocketworld is **loose on content, firm on style**. You can depict any story or scene, but the image must conform to the reference standard:
- **Good reference**: 1:1 square (1024×1024), 2:1 dimetric isometric diorama island floating on a clean pure white background (`#FFFFFF`) with wide empty margins, low-saturation refined palette, no black outlines, readable subjects with distinct gaps, and moving parts drawn clearly and unoccluded.
- **Unacceptable**: Random street photos, cluttered edge-to-edge scenes, heavy black comic outlines, oversaturated candy colors, cropped subjects.
- **Recommended path**: Generate the reference still with an image model using the prompt template in `skills/pocketworld/reference_prompt.md`.

Use the CLI helpers to generate prompts and validate images:
```bash
node cli/pocketworld.js prompt "<scene description in any language>"
node cli/pocketworld.js check-ref <image or scene>
```

## Workflow

The default mode is from-reference. Do not draw figures with SDFs. That experiment is in `experimental/sdf/` and it is not the product.

Runtime code is `src/`. Prep is `tools/pocketworld.py`, driven by `node cli/pocketworld.js`. Scenes are `examples/*/scene.json` plus `reference.jpg`.

```bash
node cli/pocketworld.js prep examples/rain-bus-stop
node cli/pocketworld.js render examples/rain-bus-stop
node cli/pocketworld.js dev
```

`index.js` does not register `<pocket-world>`. The element is `src/element.js`.

Do not commit study videos. Do not commit someone else's footage. The approved loops in `examples/*/out/` are renders from this repo.
