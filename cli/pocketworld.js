#!/usr/bin/env node
/**
 * pocketworld prep | render | phases | overlay | suggest | dev
 *
 *   node cli/pocketworld.js prep examples/rain-bus-stop
 *   node cli/pocketworld.js render examples/rain-bus-stop
 *   node cli/pocketworld.js dev
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY = process.env.PYTHON || "python3";
const TOOL = path.join(ROOT, "tools", "pocketworld.py");
const SCENES = [
  "examples/rain-bus-stop",
  "examples/rooftop-laundry",
  "examples/chess-under-tree",
  "examples/snow-campfire",
  "examples/lake-boat",
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".css": "text/css",
  ".md": "text/markdown; charset=utf-8",
};

function scenePath(arg) {
  const candidates = [path.resolve(arg), path.join(ROOT, arg), path.join(ROOT, "examples", arg)];
  for (const c of candidates) {
    if (existsSync(path.join(c, "scene.json"))) return c;
  }
  throw new Error(`no scene.json for ${arg}`);
}

function python(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(PY, [TOOL, ...args], { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`python exited ${code}`))));
  });
}

function chromePath() {
  const candidates = [
    process.env.CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome not found. Set CHROME=/path/to/chrome");
  return found;
}

function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      let name = decodeURIComponent(url.pathname);
      if (name.endsWith("/")) name += "index.html";
      name = path.normalize(name).replace(/^(\.\.(\/|\\|$))+/, "");
      const file = path.resolve(ROOT, "." + (name.startsWith("/") ? name : "/" + name));
      if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await readFile(file);
      const ext = path.extname(file);
      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

async function renderScene(scene) {
  const manifest = path.join(scene, "build", "manifest.json");
  if (!existsSync(manifest)) {
    console.log("prep", path.relative(ROOT, scene));
    await python(["prep", scene]);
  }
  const outDir = path.join(scene, "out");
  await mkdir(outDir, { recursive: true });
  const mp4 = path.join(outDir, "loop.mp4");
  const { server, port } = await startServer(0);
  const rel = path.relative(ROOT, manifest).split(path.sep).join("/");
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: "new",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("PAGEERR", e.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.error("console", m.text());
    });
    await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/cli/page.html?scene=/${rel}&scale=1&t=0`, { waitUntil: "networkidle0" });
    await page.waitForFunction("window.isReady && window.isReady()", { timeout: 60000 });
    const info = await page.evaluate("info()");
    const G = info.w;
    const fps = 60;
    const n = Math.round(info.loop * fps);
    const ff = spawn("ffmpeg", [
      "-v", "error", "-y",
      "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${G}x${G}`, "-r", String(fps), "-i", "-",
      "-vf", "vflip,scale=iw*4:ih*4:flags=neighbor",
      "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-tune", "animation",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4,
    ]);
    const ffError = new Promise((_, reject) => {
      let err = "";
      ff.stderr.on("data", (d) => { err += d; });
      ff.on("exit", (code) => { if (code) reject(new Error(err || `ffmpeg ${code}`)); });
    });
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const b64 = await page.evaluate((t) => grab(t), i / fps);
      const buf = Buffer.from(b64, "base64");
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % 120 === 0) console.log(path.basename(scene), i, "/", n, ((Date.now() - t0) / 1000).toFixed(1) + "s");
    }
    ff.stdin.end();
    await Promise.race([
      new Promise((r) => ff.on("close", r)),
      ffError,
    ]);
    console.log("wrote", path.relative(ROOT, mp4));
  } finally {
    await browser.close();
    server.close();
  }
  await python(["present", scene]);
}

async function dev(port) {
  const { server, port: actual } = await startServer(port);
  console.log(`pocketworld  http://127.0.0.1:${actual}/playground/`);
  await new Promise(() => server);
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
  render [scene]     60fps mp4, gif, compare, contact sheet, smoothness, out/<part>_phases.png
  phases <scene>     out/<part>_phases.png again from an existing out/loop.mp4
  overlay <scene>    coordinate grid on the reference
  suggest <scene>    key-colour and cloth/wet guesses
  dev [--port N]     playground on :8787
`);
}

const [cmd, ...rest] = process.argv.slice(2);
// flags that take a value; their value is not a scene path
const VALUE_FLAGS = ["--step", "--port"];
const positionals = rest.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(rest[i - 1]));
const portFlag = rest.indexOf("--port");
const port = portFlag >= 0 ? Number(rest[portFlag + 1]) : 8787;

if (!cmd || cmd === "help" || cmd === "--help") {
  help();
  process.exit(0);
} else if (cmd === "prompt") {
  const desc = positionals.join(" ") || rest.filter((a) => !a.startsWith("--")).join(" ");
  generatePrompt(desc);
  process.exit(0);
} else if (cmd === "check-ref") {
  if (!positionals.length) {
    console.error("check-ref requires an image file path or scene directory (e.g. node cli/pocketworld.js check-ref examples/rain-bus-stop)");
    process.exit(1);
  }
  for (const target of positionals) {
    await python(["check-ref", resolveRefTarget(target)]);
  }
  process.exit(0);
}

const scenes = positionals.length ? positionals.map(scenePath) : SCENES.map((s) => path.join(ROOT, s));

if (cmd === "prep") {
  for (const s of scenes) await python(["prep", s]);
} else if (cmd === "render") {
  for (const s of scenes) await renderScene(s);
} else if (cmd === "phases") {
  if (!positionals.length) throw new Error("phases needs a scene");
  for (const s of scenes) await python(["phases", s]);
} else if (cmd === "overlay") {
  if (!positionals.length) throw new Error("overlay needs a scene");
  const step = rest.includes("--step") ? ["--step", rest[rest.indexOf("--step") + 1]] : [];
  for (const s of scenes) await python(["overlay", s, ...step]);
} else if (cmd === "suggest") {
  if (!positionals.length) throw new Error("suggest needs a scene");
  for (const s of scenes) await python(["suggest", s]);
} else if (cmd === "dev") {
  await dev(port);
} else {
  help();
  process.exit(1);
}
