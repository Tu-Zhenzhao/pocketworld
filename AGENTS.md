# Pocketworld 0.6.0

Read `skills/pocketworld/SKILL.md` before authoring or refining scenes. Public agent onboarding starts at `INSTALL.md` and `llms.txt`.

- Canonical runtime/templates/examples: `skills/pocketworld/assets/`. The renderer uses native geometry and pixel drawing; a reference image guides design.
- CLI: `cli/pocketworld.js`. Self-contained installed helpers: `skills/pocketworld/scripts/`.
- `examples/` contains generated ready-to-review outputs. Edit canonical scene sources under the Skill, then regenerate; do not hand-edit generated bundles.
- Retain the review UI, meaningful detail crops and real variant selection. Let users choose final formats. MP4 is opaque; GIF is binary transparency/20fps; components preserve alpha and white objects.
- Components receive deterministic unique tags per scene/content/variant. Test different worlds on the same page.
- The v0.3 raster pipeline was removed. Historical files are available at the snapshot linked in `docs/migration.md`. Do not reintroduce it as a native-scene fallback.
- UI checks use Node + Playwright with reusable assertions. Screenshots supplement visual art review.
- Choose feature budgets before canvas size; inspect annotated `references/art-studies.md` and actual native construction stages. `scripts/study.mjs` samples without a browser. Record actual art findings, not a numeric beauty score.
- Preserve cloud media/file delivery and the local review UI. Unreachable cloud localhost must not block CPU export or imply successful browser playback.
- Required checks: `npm test`, `npm run test:art`, `npm run test:cpu`, `npm run test:native`, `npm run test:install`, `node tests/examples.mjs`, `node tools/check-package.mjs` after packaging. Regenerate teaching plates with `npm run studies` when their sources change.
- Node20+, pinned npm lockfiles. Runtime users need no Python; development media verification uses Pillow from `tests/requirements.txt`.
- Package only source, owned renders, docs, lockfiles and manifests. Exclude caches, browser binaries, machine paths, keys and third-party footage. Keep CLI and standalone Skill installation both working.
