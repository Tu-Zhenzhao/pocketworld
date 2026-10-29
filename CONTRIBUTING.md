# Work on Pocketworld

Canonical Skill sources live in `skills/pocketworld/`. Keep that directory independently installable. Edit source scenes under `assets/examples/`; ready-made outputs under `examples/` are generated.

```sh
npm ci
npm run setup
python3 -m pip install -r tests/requirements.txt  # development media verification only
npm test
npm run test:art
npm run test:cpu
npm run test:native
npm run test:install
node tests/examples.mjs
npm run package:release
node tools/check-package.mjs
```

Playwright uses the detected Chrome; no Playwright browser download is necessary. `CHROME`, `FFMPEG_PATH`, `FFPROBE_PATH`, `PYTHON` and optional `PLAYWRIGHT_MODULE` are explicit test/runtime overrides. Test reports are retained at the printed temporary paths. CI runs Node20 and22 on Ubuntu24.04 with a managed Chrome for Testing build.

Verify actual alpha and a white object, backward seeking, loop behavior, controls, responsive layout, component lifetime and two different scenes on one page. Check actual video/GIF metadata/playback and new-scene output. A clean installed Skill must work from outside this repository with its own `npm ci`.

When changing lesson sources run `npm run studies` and visually inspect the resulting plates. The art suite runs without Chrome, checks actual neck connectivity across 721 frames, rejects the real broken-neck counterexample, verifies exact integer enlargement and exercises three other subjects. Browser-enabled runs also verify the study gallery and pottery player. These are technical/structural regressions, not automated artistic approval.

For a release, update root/package lock and Skill script package/lock versions, `skills/pocketworld/VERSION`, `INSTALL.md`, README release links and changelog. Regenerate examples from canonical sources, then the README GIF. Package owned source/media only; include manifest hashes and SHA256SUMS. Run all checks, publish the reviewed commit/tag and attach the release archives. Do not put browser binaries, local cache paths, credentials, generated frame caches or third-party artist footage in Git or release archives.

Browserless CI runs the native CPU suite independently. Before claiming target-agent compatibility, validate an actual fresh install and new render in that host, not just developer/CI browsers. Preserve the approved reference style by inspecting its visual anchors before image generation.
