#!/usr/bin/env node
/**
 * pocketworld prep | render | overlay | suggest | dev
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
const SCENES = ["examples/rain-bus-stop", "examples/rooftop-laundry"];

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

function help() {
  console.log(`pocketworld

  prep [scene]       downsample, palette, masks  (default: both examples)
  render [scene]     60fps mp4, gif, compare, contact sheet, smoothness
  overlay <scene>    coordinate grid on the reference
  suggest <scene>    key-colour and cloth/wet guesses
  dev [--port N]     playground on :8787
`);
}

const [cmd, ...rest] = process.argv.slice(2);
const positionals = rest.filter((a) => !a.startsWith("--"));
const portFlag = rest.indexOf("--port");
const port = portFlag >= 0 ? Number(rest[portFlag + 1]) : 8787;

const scenes = positionals.length ? positionals.map(scenePath) : SCENES.map((s) => path.join(ROOT, s));

if (!cmd || cmd === "help" || cmd === "--help") {
  help();
} else if (cmd === "prep") {
  for (const s of scenes) await python(["prep", s]);
} else if (cmd === "render") {
  for (const s of scenes) await renderScene(s);
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
