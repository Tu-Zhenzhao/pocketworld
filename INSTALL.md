# Install Pocketworld 0.6.0

This is the public entry point for agents. Read this file, install the Skill into the calling host's supported directory, then read the installed `SKILL.md`. Do not stop after cloning the repository.

## 1. Choose the host directory

Use the host's documented Skill directory. For Codex it is `$CODEX_HOME/skills/pocketworld`, or `~/.codex/skills/pocketworld` when `CODEX_HOME` is unset. For another agent, follow that host's Skill conventions and pass the resulting destination explicitly. Do not install into multiple hosts or alter unrelated configuration.

If the host has its own GitHub Skill installer, the source is:

```text
Repository: Tu-Zhenzhao/pocketworld
Ref: v0.6.0
Skill path: skills/pocketworld
```

That installer may copy files only. Continue with runtime setup and the smoke test below.

## 2. Install the pinned release

Requires Node20+, npm, Git and an agent able to run terminal commands. A reference-image generation tool is optional if the user supplies an image. The renderer itself uses no model API key.

```sh
git clone --depth 1 --branch v0.6.0 https://github.com/Tu-Zhenzhao/pocketworld.git pocketworld-source
cd pocketworld-source
node scripts/install.mjs --dest /absolute/path/to/host/skills/pocketworld
```

Replace the destination with the directory selected in step1. Paths with spaces must be quoted. The installer copies the complete Skill, installs its locked Node dependencies, verifies native CPU geometry/motion/alpha without needing Chrome. Existing targets are protected. To update an existing recognized Pocketworld installation:

```sh
node scripts/install.mjs --dest /absolute/path/to/host/skills/pocketworld --update
```

The old Skill is backed up outside active Skill discovery before replacement. Unrecognized directories are never overwritten. Browser download is optional with `--install-browser`; default installation needs no browser. `--no-browser-download` remains accepted.

Alternatively download `pocketworld-0.6.0-skill.zip` and `SHA256SUMS` from the [release](https://github.com/Tu-Zhenzhao/pocketworld/releases/tag/v0.6.0), verify the archive checksum, extract it, then run its `pocketworld/scripts/install.mjs --dest ...` with Node. The archive includes `SKILL.md`, guides, examples, runtime and dependency lockfile.

## 3. Check the installed runtime

Let `SKILL_ROOT` mean the absolute directory containing the installed `SKILL.md`; use a normal task variable if issuing shell commands.

```sh
node /absolute/path/to/installed/pocketworld/scripts/doctor.mjs --backend cpu
```

Expect `ready: true`, `selectedBackend: cpu` and a passing `native-cpu` check. Browser startup is independent and optional. ffmpeg is optional for preview/component delivery and required for video/GIF. Install it through the host's normal package manager or set `FFMPEG_PATH`. See [troubleshooting](docs/troubleshooting.md) for missing browser libraries and restricted hosts.

When installed through a host's copy-only installer, first run:

```sh
node /absolute/path/to/installed/pocketworld/scripts/setup.mjs
```

## 4. Run a real smoke test

Choose a fresh output directory whose parent already exists:

```sh
node /absolute/path/to/installed/pocketworld/scripts/deliver.mjs \
  /absolute/path/to/installed/pocketworld/assets/examples/juggler \
  --out /absolute/path/to/fresh-review --formats preview,component --backend cpu
```

On a local host, run `node /absolute/path/to/installed/pocketworld/scripts/serve.mjs /absolute/path/to/fresh-review` and open the printed URL. Verify play/pause, replay, seeking and detail view. Select the transparent component, inspect `embed.html` on a colored background, and confirm that actor, balls and white clothing remain visible. The component is also available as unbundled modules for stricter CSP.

On a cloud host whose workspace localhost is unreachable, inspect the fresh poster directly and attach the media/review package to the conversation; interactive playback remains unverified there. Native CPU export and browser-free study sampling still work. No public server or host security change is required. Do not keep retrying localhost or claim that an unreachable cloud URL is a user-viewable preview.

## 5. Start the user's world

Read the installed `SKILL.md` and its relevant references. Turn the user's sentence and reference into a scene-specific composition, native shapes and shared action state. Existing examples are implementation guidance; a new prompt needs a new design, not a relabeled sample. Keep the review UI, refine the scene and let the user choose video, GIF or a web component.

For 0.6, view the installed annotated art studies, choose local feature budgets, and make a readable silhouette/major-value still before animation. `scripts/study.mjs` produces integer detail evidence without Chrome. Direct-cell and geometry starters are both included. Canvas custom adapters must declare actual `config.palette`; missing fields fail before a broken player is handed off.

A host may require refreshing Skill discovery or starting the next agent turn before a newly installed Skill is available. Report the actual install location, version, doctor result and preview path. Do not claim an installation worked if the environment could not render the smoke test.
