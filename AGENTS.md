# Agents

Read `skills/pocketworld/SKILL.md` before you add or retune a scene. It is the whole workflow: a reference painting, `scene.json`, prep, then the shader. `skills/pocketworld/spec.md` is the look. `skills/pocketworld/reference_prompt.md` is the image prompt guide. `skills/pocketworld/checklist.md` is the list you finish.

## Step 0: Reference Image Standard

Pocketworld is **loose on content, firm on style**. You can depict any story or scene, but the image must conform to the reference standard:
- **Good reference**: 1:1 square canvas (1024×1024), 2:1 dimetric perspective floating on a clean pure white background (`#FFFFFF`) with wide empty margins. Composition varies with the subject (square island block, long strip, narrow slice, circular stage, or open soft-fading vignette). Low-saturation refined palette, no black outlines, readable subjects with distinct gaps, and moving parts drawn clearly and unoccluded.
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

Before making a scene, run `node cli/pocketworld.js doctor --json`. Set `PYTHON` to the Python venv executable. A missing Chrome is acceptable when the CPU frame and encoding checks pass. Use `--backend cpu` in browser-restricted hosts; do not keep adding flags to bypass host restrictions.

```bash
node cli/pocketworld.js doctor --json
node cli/pocketworld.js prep examples/rain-bus-stop
node cli/pocketworld.js render examples/rain-bus-stop
node cli/pocketworld.js dev
```

`render` defaults to `--backend auto` (inline browser probe, then CPU fallback). Browser export has no HTTP requests; `--server` is only a diagnostic fallback. `--smoke` writes 10 cached frames without publishing, `--frames 0:360` then `--frames 360:720` resumes and encodes. Inputs and renderer code fingerprint the frame cache. Do not render the same scene concurrently.

Check `build/last-run.json` and `out/render.json`; old files in `out/` are not proof of a new successful render. Without ffmpeg, GIF/PNG diagnostics still work and status is `complete-gif-only`. Run `parity` after changing shader or CPU math; update both implementations together. The CPU numeric reference is SwiftShader, not arbitrary hardware GPU math.

`index.js` does not register `<pocket-world>`. The element is `src/element.js`.

Do not commit study videos. Do not commit someone else's footage. The approved loops in `examples/*/out/` are renders from this repo.
