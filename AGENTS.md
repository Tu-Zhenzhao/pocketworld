# Agents

Read `skills/pocketworld/SKILL.md` before you add or retune a scene. It is the whole workflow: reference image, scene file, stills, compare, then the plain-language knobs.

The look is specified in `skills/pocketworld/spec.md`. The prompt you fill for an image model is `skills/pocketworld/reference-prompt.md`.

Runtime code lives in `src/`. Scenes live in `examples/*/scene.js`. Render with `node cli/render.js`. The playground is `npm run dev`.

Do not import `src/index.js` from a Node script that also expects the custom element. `index.js` is the browser/library entry and does not register `<pocket-world>`. Node should import `src/scene.js` and `src/compile.js`, or just import a scene module.
