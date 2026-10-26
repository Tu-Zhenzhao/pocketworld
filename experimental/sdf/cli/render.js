#!/usr/bin/env node
/**
 * Render a pocket world without a display.
 *
 *   node cli/render.js still examples/rain-bus-stop/scene.js --time 2.4 --out frame.png
 *   node cli/render.js gif  examples/rain-bus-stop/scene.js --out docs/rain.gif
 *   node cli/render.js mp4  examples/rain-bus-stop/scene.js --out docs/rain.mp4
 *   node cli/render.js compare examples/rain-bus-stop/scene.js --time 2.4 --out cmp.png
 *   node cli/render.js gallery
 *
 * compare looks for reference.png or reference.jpg next to the scene.
 * Chrome is launched with SwiftShader. Set CHROME_PATH if it lives elsewhere.
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import os from "node:os";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/google-chrome",
    "/usr/local/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome not found. Set CHROME_PATH.");
  return found;
}

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const file = path.normalize(path.join(root, pathname));
      if (!file.startsWith(root)) { res.writeHead(403); res.end("no"); return; }
      const data = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function launch(port) {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: "new",
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--no-sandbox",
      "--ignore-gpu-blocklist",
      "--disable-dev-shm-usage",
    ],
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("pageerror", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("console", msg.text());
  });
  return { browser, page, port };
}

async function openScene(page, port, scenePath, opts) {
  const q = new URLSearchParams();
  q.set("scene", scenePath.startsWith("/") ? scenePath : `/${scenePath}`);
  q.set("size", String(opts.size || 720));
  if (opts.grid) q.set("grid", String(opts.grid));
  if (opts.bayer) q.set("bayer", String(opts.bayer));
  if (opts.time != null) q.set("t", String(opts.time));
  await page.setViewport({ width: Number(opts.size || 720) + 20, height: Number(opts.size || 720) + 20, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/cli/page.html?${q}`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction("window.__ready === true", { timeout: 20000 });
  const error = await page.evaluate(() => window.__error || "");
  if (error) {
    const scene = await importScene(scenePath);
    const { compile } = await import(pathToFileURL(path.join(root, "src/compile.js")).href);
    const { frag } = compile(scene);
    const dump = path.join(os.tmpdir(), "pocketworld-shader.frag");
    await writeFile(dump, frag);
    const lines = frag.split("\n");
    const mentioned = [...error.matchAll(/ERROR:\s*\d+:(\d+)/g)].map((m) => Number(m[1]));
    let context = "";
    for (const n of mentioned) {
      context += lines.slice(Math.max(0, n - 4), n + 3).map((l, i) => `${n - 4 + i + 1}: ${l}`).join("\n") + "\n";
    }
    throw new Error(`${error}\nshader written to ${dump}\n${context}`);
  }
}

async function importScene(scenePath) {
  const abs = path.resolve(root, scenePath);
  const mod = await import(pathToFileURL(abs).href);
  return mod.default;
}

async function shoot(page, file) {
  const canvas = await page.$("canvas");
  await canvas.screenshot({ path: file });
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-1200)));
    });
  });
}

async function framesFor(page, spec, dir) {
  await mkdir(dir, { recursive: true });
  const n = Math.round(spec.duration * spec.fps);
  for (let i = 0; i < n; i++) {
    const t = i / spec.fps;
    await page.evaluate((time) => window.renderFrame(time), t);
    await shoot(page, path.join(dir, `${String(i).padStart(4, "0")}.png`));
    if (i % spec.fps === 0) process.stdout.write(`  frame ${i}/${n}\n`);
  }
  return n;
}

function findReference(scenePath) {
  const dir = path.dirname(path.resolve(root, scenePath));
  for (const name of ["reference.png", "reference.jpg", "reference.jpeg"]) {
    const p = path.join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

async function compareImages(ref, frame, out) {
  await mkdir(path.dirname(path.resolve(out)), { recursive: true });
  await ffmpeg([
    "-i", ref,
    "-i", frame,
    "-filter_complex",
    "[0:v]scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2:white[a];[1:v]scale=720:720:flags=neighbor[b];[a][b]hstack=inputs=2",
    out,
  ]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || "help";
  if (cmd === "help" || args.help) {
    console.log(`pocketworld render

  still <scene.js>   --time 2.4 --out frame.png --size 720
  gif <scene.js>     --out docs/scene.gif
  mp4 <scene.js>     --out docs/scene.mp4
  frames <scene.js>  --out tmp/frames
  compare <scene.js> --time 2.4 --out cmp.png [--ref image]
  gallery            render every example into docs/
`);
    return;
  }

  if (cmd === "compile") {
    const scene = await importScene(args._[1]);
    const { compile } = await import(pathToFileURL(path.join(root, "src/compile.js")).href);
    const { frag, params } = compile(scene);
    const dump = args.out || path.join(os.tmpdir(), "pocketworld-shader.frag");
    await writeFile(dump, frag);
    console.log(`shader ${frag.split("\n").length} lines -> ${dump}`);
    console.log(params.map((p) => `  ${p.group.padEnd(6)} ${p.key} = ${p.value}  ${p.doc || ""}`).join("\n"));
    return;
  }

  const { server, port } = await serve();
  const { browser, page } = await launch(port);
  try {
    if (cmd === "gallery") {
      const scenes = [
        "examples/rain-bus-stop/scene.js",
        "examples/fishing/scene.js",
        "examples/basketball/scene.js",
        "examples/juggler/scene.js",
      ];
      await mkdir(path.join(root, "docs"), { recursive: true });
      for (const scenePath of scenes) {
        if (!existsSync(path.join(root, scenePath))) { console.log("skip", scenePath); continue; }
        const spec = await importScene(scenePath);
        const id = spec.id || path.basename(path.dirname(scenePath));
        console.log(`\n${spec.name}`);
        await openScene(page, port, scenePath, { size: args.size || 720 });
        const dir = path.join(os.tmpdir(), `pw-${id}`);
        await rm(dir, { recursive: true, force: true });
        await framesFor(page, spec, dir);
        const gif = path.join(root, "docs", `${id}.gif`);
        const mp4 = path.join(root, "docs", `${id}.mp4`);
        await ffmpeg(["-framerate", String(spec.fps), "-i", path.join(dir, "%04d.png"), "-vf", "scale=640:640:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=48:stats_mode=diff[p];[s1][p]paletteuse=dither=none", "-loop", "0", gif]);
        await ffmpeg(["-framerate", String(spec.fps), "-i", path.join(dir, "%04d.png"), "-vf", "scale=640:640:flags=neighbor", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", mp4]);
        console.log("  wrote", path.relative(root, gif));
        if (id === "rain-bus-stop") {
          const ref = findReference(scenePath);
          const still = path.join(dir, "0000.png");
          await page.evaluate((t) => window.renderFrame(t), spec.poster || 0);
          await shoot(page, still);
          if (ref) await compareImages(ref, still, path.join(root, "docs", "rain-bus-stop-compare.png"));
        }
        await rm(dir, { recursive: true, force: true });
      }
      return;
    }

    const scenePath = args._[1];
    if (!scenePath) throw new Error("Missing scene path");
    const spec = await importScene(scenePath);
    const size = Number(args.size || 720);
    await openScene(page, port, scenePath, { size, grid: args.grid, bayer: args.bayer, time: args.time });

    if (cmd === "still") {
      const out = args.out || "frame.png";
      await mkdir(path.dirname(path.resolve(out)), { recursive: true });
      if (args.time != null) await page.evaluate((t) => window.renderFrame(t), Number(args.time));
      await shoot(page, out);
      console.log(out);
      return;
    }
    if (cmd === "compare") {
      const ref = args.ref || findReference(scenePath);
      if (!ref) throw new Error("No reference image. Pass --ref or add reference.png beside the scene.");
      const out = args.out || "compare.png";
      const frame = path.join(os.tmpdir(), "pw-compare-frame.png");
      if (args.time != null) await page.evaluate((t) => window.renderFrame(t), Number(args.time));
      await shoot(page, frame);
      await compareImages(ref, frame, out);
      console.log(out);
      return;
    }
    if (cmd === "frames" || cmd === "gif" || cmd === "mp4") {
      const dir = cmd === "frames" ? (args.out || path.join(os.tmpdir(), "pw-frames")) : path.join(os.tmpdir(), `pw-${spec.id || "scene"}`);
      if (cmd !== "frames") await rm(dir, { recursive: true, force: true });
      await framesFor(page, spec, dir);
      if (cmd === "frames") { console.log(dir); return; }
      const out = args.out || `${spec.id || "scene"}.${cmd}`;
      await mkdir(path.dirname(path.resolve(out)), { recursive: true });
      if (cmd === "gif") {
        await ffmpeg(["-framerate", String(spec.fps), "-i", path.join(dir, "%04d.png"), "-vf", "scale=640:640:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=48:stats_mode=diff[p];[s1][p]paletteuse=dither=none", "-loop", "0", out]);
      } else {
        await ffmpeg(["-framerate", String(spec.fps), "-i", path.join(dir, "%04d.png"), "-vf", "scale=640:640:flags=neighbor", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", out]);
      }
      await rm(dir, { recursive: true, force: true });
      console.log(out);
      return;
    }
    throw new Error(`Unknown command ${cmd}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
