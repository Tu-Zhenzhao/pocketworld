# Troubleshooting

Start with `node /path/to/pocketworld/scripts/doctor.mjs` (or `npm run doctor` in the repository).

| Symptom | Action |
|---|---|
| Missing Node modules | Run the installed `scripts/setup.mjs --install-browser`; it uses the shipped lockfile |
| Chrome not found | Run setup with `--install-browser`, or set `CHROME` to its executable path |
| Invalid `CHROME` | Fix or unset it; an explicit override is authoritative |
| System Chrome is unstable | Unset `CHROME`, then run `scripts/setup.mjs --install-browser --force-browser-download` to use managed Chrome for Testing |
| Chrome exits on Linux | Install the browser's system libraries using the host's package manager; CI uses Ubuntu with Chrome for Testing. `ldd /path/to/chrome` can identify missing libraries |
| Browser execution forbidden by the host | Keep source and diagnostics; report preview unverified. There is no native-scene CPU fallback |
| Missing ffmpeg | Install ffmpeg or set `FFMPEG_PATH`; preview/component export does not require it |
| Output directory already exists | Choose a fresh output directory; existing results are protected |
| Component blocked by CSP | Use `component-module.js` with its `engine/` and `scenes/` directories; permit the resulting script paths |
| Component missing in a blog platform | Check whether that platform strips scripts/custom elements. Use GIF/video where scripts are unavailable |
| White clothes disappear | Rebuild with true alpha; never remove the background by color-keying white |
| Selecting another variant hides Download | That alternative has not been exported. Copy the request or export with `--variant its-id` |
| New Skill is not discovered | Refresh/restart discovery according to the agent host; confirm its Skill directory and installed version |
| Scene is unattractive despite passing tests | Inspect silhouette, pose and cell budget first; use the drawing recipes. Export tests do not score aesthetics |

No runtime API key is required. Reference image generation uses the calling agent's image tool; if unavailable, use a supplied image or create a native blockout and describe the missing reference step honestly.
