#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./browser.js";
import { python } from "./environment.js";
import { startServer } from "./server.js";
import { ensurePrepared, renderScene, runParity } from "./render.js";
import { doctor } from "./doctor.js";

const SCENES = ["rain-bus-stop", "rooftop-laundry", "chess-under-tree", "snow-campfire", "lake-boat"];
function scenePath(arg) {
  for (const c of [path.resolve(arg), path.join(ROOT, arg), path.join(ROOT, "examples", arg)]) {
    if (existsSync(path.join(c, "scene.json"))) return c;
  }
  throw new Error(`no scene.json for ${arg}`);
}

function generatePrompt(desc) {
  if (!desc || !desc.trim()) {
    console.log(`pocketworld reference image prompt generator

Usage:
  node cli/pocketworld.js prompt "<scene description in any language>"

Template:
  A square illustration of a miniature diorama on a pure white background, 1024 by 1024, with a wide empty white margin.
  Composition: [CHOOSE FOOTPRINT: square island block | long horizontal or diagonal strip | short narrow slice | small round stage/platform | open vignette with soft dissolving edges].
  The scene is [ONE-SENTENCE SCENE SUMMARY: who, where, time of day, atmosphere].
  2:1 dimetric perspective, like a miniature model on a desk: the ground recedes down-left and down-right, figures stand upright, camera looks slightly down.
  Soft lighting. Delicate low-saturation refined palette, muted painterly watercolor tones, no black outlines, no text, no watermark, no border, no frame.
  Diorama perimeter fades softly into the clean white paper.
  [MATERIALS AND KEY ACCENT COLOURS].
  Figures and gestures: [LIST FIGURES AND THEIR POSE/GESTURE with distinct negative space].
  Moving elements: [LIST 1-3 MOVING PARTS: e.g. cloth, umbrella, fan, flame, fishing rod, pet] clearly delineated and unoccluded with space around them.
  Painterly pixel diorama aesthetic, airy and clean.

Examples in this repo:
  - rain-bus-stop:     "a quiet bus stop in the rain at dusk with a woman holding a rose umbrella..."
  - rooftop-laundry:   "a sunlit rooftop terrace with clothes swaying on a line and a sleeping cat..."
  - chess-under-tree:  "two friends playing chess under a leafy tree, one waving a palm-leaf fan..."
  - snow-campfire:     "a winter campsite in fresh snow with a flickering campfire and sleeping dog..."
  - lake-boat:         "an elderly fisherman in a wooden boat on a calm lake at twilight holding a slender fishing rod..."

See skills/pocketworld/reference_prompt.md for detailed guidelines.
`);
    return;
  }

  const prompt = `A square illustration of a miniature diorama on a pure white background, 1024 by 1024, with a wide empty white margin. The scene is ${desc.trim()}. 2:1 dimetric perspective, like a miniature architectural model on a desk: the ground recedes down-left and down-right, figures stand upright, camera looks slightly down. Composition fits the subject naturally (e.g. a small island block, a long slice or strip, a round platform, or an open vignette with no hard boundary fading softly into white paper). Soft lighting. Delicate low-saturation refined palette, muted painterly watercolor tones, no black outlines, no ink contours, no comic art, no text, no watermark, no border, no frame. Figures have clear gestures with distinct negative space; all moving parts (e.g. cloth, handheld props, foliage, water ripples, or flames) are clearly visible, unoccluded, and separable from the background. Painterly pixel diorama aesthetic, airy and clean.`;

  const negative = `photorealistic, photograph, real-life street photo, black outlines, heavy ink contours, comic art, cel shading, vector graphic, text, watermark, signature, logo, border, frame, card border, edge-to-edge background, sky filling frame, cropped diorama, touching borders, oversaturated, neon candy colors, 3D plastic render, high gloss.`;

  console.log(`\n================================================================================`);
  console.log(`POCKETWORLD REFERENCE IMAGE PROMPT`);
  console.log(`================================================================================\n`);
  console.log(prompt);
  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(`NEGATIVE PROMPT:`);
  console.log(`--------------------------------------------------------------------------------\n`);
  console.log(negative);
  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(`STYLE CONTRACT & NEXT STEPS:`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`1. Aspect ratio: 1:1 square canvas (ideal: 1024x1024).`);
  console.log(`2. Background: Pure clean white (#FFFFFF) with wide empty margins on all sides.`);
  console.log(`3. Composition: Free footprint (square island, long strip, circular stage, or soft open vignette).`);
  console.log(`4. Style: Loose on content, firm on style. Low saturation, no black outlines.`);
  console.log(`5. Save your image to: examples/<name>/reference.jpg`);
  console.log(`6. Validate with: node cli/pocketworld.js check-ref examples/<name>/reference.jpg\n`);
}

function resolveRefTarget(arg) {
  if (existsSync(arg)) return path.resolve(arg);
  const candidates = [path.resolve(arg), path.join(ROOT, arg), path.join(ROOT, "examples", arg)];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return path.resolve(arg);
}

function help() {
  console.log(`pocketworld

  prompt [desc]      generate a ready-to-use reference image prompt from a concept
  check-ref <image>  validate reference image (1:1 square, white margins, saturation, luminance)
  prep [scene]       downsample, palette, masks, build/parts.png  (default: all examples)
  render [scene]     60fps mp4, gif, compare, contact, metrics and motion phases
    --backend auto|cpu|browser  auto probes Chrome, falls back to CPU (default)
    --smoke         capture 10 frames; do not replace out/
    --frames a:b    capture a half-open frame range; resume and encode when complete
    --server        browser only: use the legacy localhost page
    --force-prep    rebuild even if inputs have not changed
  doctor [--json]    environment checks and selected render backend
  parity [scene]    CPU vs browser; --times 0,3 --max-ratio 0.001 --out <directory>
  phases <scene>     out/<part>_phases.png again from an existing out/loop.mp4
  overlay <scene>    coordinate grid on the reference
  suggest <scene>    key-colour and cloth/wet guesses
  dev [--port N]     playground on :8787
`);
}


const [cmd, ...rest] = process.argv.slice(2);
const valueFlags = new Set(["--step", "--port", "--backend", "--frames", "--times", "--max-ratio", "--out"]);
const values = {}, positionals = [];
try {
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (valueFlags.has(a)) {
      if (!rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error(`missing value for ${a}`);
      values[a] = rest[++i];
    } else if (a.startsWith("--")) {
      if (!["--smoke", "--server", "--force-prep", "--json"].includes(a)) throw new Error(`unknown option ${a}`);
      values[a] = true;
    } else positionals.push(a);
  }
  const opts = { backend: values["--backend"], frames: values["--frames"], smoke: values["--smoke"],
    server: values["--server"], forcePrep: values["--force-prep"], times: values["--times"],
    maxRatio: values["--max-ratio"], directory: values["--out"] };
  if (opts.smoke && opts.frames) throw new Error("choose either --smoke or --frames a:b");
  if (!cmd || ["help", "--help"].includes(cmd)) help();
  else if (cmd === "prompt") generatePrompt(positionals.join(" "));
  else if (cmd === "doctor") {
    const result = await doctor({ json: values["--json"] });
    if (!result.usable) process.exitCode = 1;
  } else if (cmd === "check-ref") {
    if (!positionals.length) throw new Error("check-ref needs an image or scene directory");
    for (const p of positionals) await python(["check-ref", resolveRefTarget(p)], { echo: true });
  } else if (cmd === "dev") {
    const { port } = await startServer(ROOT, Number(values["--port"] || 8787));
    console.log(`pocketworld  http://127.0.0.1:${port}/playground/`);
  } else if (["prep", "render", "parity", "phases", "overlay", "suggest"].includes(cmd)) {
    if (["phases", "overlay", "suggest"].includes(cmd) && !positionals.length) throw new Error(`${cmd} needs a scene`);
    for (const scene of (positionals.length ? positionals : SCENES).map(scenePath)) {
      if (cmd === "prep") await ensurePrepared(scene, true);
      else if (cmd === "render") await renderScene(scene, opts);
      else if (cmd === "parity") await runParity(scene, opts);
      else await python([cmd, scene, ...(cmd === "overlay" && values["--step"] ? ["--step", values["--step"]] : [])], { echo: true });
    }
  } else throw new Error(`unknown command ${cmd}`);
} catch (error) {
  console.error(`pocketworld: ${error.message}`);
  process.exitCode = 1;
}
