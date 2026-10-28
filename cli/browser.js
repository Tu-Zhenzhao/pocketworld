import { readFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { deadline } from "./process.js";
import { startServer } from "./server.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function chromePath() {
  // An explicit override is authoritative, including a nonexistent path.
  if (process.env.CHROME) {
    if (!existsSync(process.env.CHROME)) throw new Error(`CHROME does not exist: ${process.env.CHROME}`);
    return process.env.CHROME;
  }
  const found = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
  if (!found) throw new Error("Chrome not found. Set CHROME=/path/to/chrome or use --backend cpu.");
  return found;
}

export async function launchBrowser({ timeout = 5000, onStage = () => {} } = {}) {
  const executablePath = chromePath(), attempts = [];
  const variants = [{}, { pipe: true, extra: ["--no-zygote"] },
    { pipe: true, headless: "shell", extra: ["--no-zygote", "--single-process"] }];
  for (let i = 0; i < variants.length; i++) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pocketworld-chrome-"));
    const v = variants[i];
    try {
      const browser = await puppeteer.launch({ executablePath, headless: v.headless || true,
        pipe: v.pipe || false, userDataDir: dir, timeout,
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox",
          "--ignore-gpu-blocklist", "--disable-dev-shm-usage", "--disable-crash-reporter",
          "--disable-breakpad", "--disable-crashpad-for-testing", ...(v.extra || []),
          ...(process.env.CHROME_FLAGS || "").split(/\s+/).filter(Boolean)] });
      onStage("browser-launch", { executablePath, attempt: i + 1, attempts });
      let closed = false;
      const close = async () => {
        if (closed) return;
        closed = true;
        process.off("SIGINT", interrupted); process.off("SIGTERM", interrupted);
        const proc = browser.process();
        try { await deadline(browser.close(), 3000, "browser close"); }
        catch { proc?.kill("SIGKILL"); }
        finally { await rm(dir, { recursive: true, force: true }); }
      };
      const interrupted = () => { close().finally(() => process.exit(130)); };
      process.once("SIGINT", interrupted); process.once("SIGTERM", interrupted);
      return { browser, close, attempts };
    } catch (error) {
      attempts.push({ attempt: i + 1, error: error.message });
      await rm(dir, { recursive: true, force: true });
    }
  }
  throw new Error(`browser-launch: all attempts failed\n${attempts.map(x => `attempt ${x.attempt}: ${x.error}`).join("\n")}`);
}

const moduleUrl = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
export async function inlineScene(scene) {
  const manifest = JSON.parse(await readFile(path.join(scene, "build/manifest.json"), "utf8"));
  for (const [k, rel] of Object.entries(manifest.textures)) {
    manifest.textures[k] = `data:image/png;base64,${(await readFile(path.resolve(scene, "build", rel))).toString("base64")}`;
  }
  // ResolveManifest needs an absolute base even though every resource is inline.
  manifest.base = "http://pocketworld.invalid/";
  const shaderUrl = moduleUrl(await readFile(path.join(ROOT, "src/shaders.js"), "utf8"));
  const playerUrl = moduleUrl((await readFile(path.join(ROOT, "src/player.js"), "utf8"))
    .replace('"./shaders.js"', JSON.stringify(shaderUrl)));
  return { manifest, playerUrl };
}

export async function openBrowserScene(scene, { serverMode = false, timeout = 15000, onStage = () => {} } = {}) {
  let handle, server;
  try {
    handle = await launchBrowser({ onStage });
    const page = await handle.browser.newPage();
    page.setDefaultTimeout(timeout);
    await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 1 });
    let info;
    if (serverMode) {
      if (!scene.startsWith(ROOT + path.sep)) throw new Error("server mode needs a scene inside this repository; use inline mode for external scenes");
      const started = await startServer(ROOT); server = started.server;
      const rel = path.relative(ROOT, path.join(scene, "build/manifest.json")).split(path.sep).join("/");
      await page.goto(`http://127.0.0.1:${started.port}/cli/page.html?scene=/${rel}&scale=1&t=0`, { waitUntil: "load", timeout });
      await page.waitForFunction("window.__ready === true", { timeout });
      info = await page.evaluate(() => window.__player.info());
    } else {
      const bundle = await inlineScene(scene);
      // A testable contract: HTTP(S) requests are rejected, not silently tolerated.
      await page.setRequestInterception(true);
      page.on("request", (req) => /^(https?|file):/.test(req.url()) ? req.abort() : req.continue());
      await page.setContent('<!doctype html><meta charset="utf-8"><canvas id="c"></canvas>', { waitUntil: "load", timeout });
      onStage("inline-page", {});
      info = await deadline(page.evaluate(async ({ manifest, playerUrl }) => {
        const { mount } = await import(playerUrl);
        window.__player = await mount(document.getElementById("c"), manifest, { scale: 1, autoplay: false, time: 0 });
        return window.__player.info();
      }, bundle), timeout, "WebGL2 mount");
    }
    onStage("webgl2", info);
    const first = Buffer.from(await deadline(page.evaluate(() => window.__player.grab(0)), timeout, "readPixels probe"), "base64");
    if (first.length !== info.w * info.h * 4 || !first.some((v, i) => i % 4 !== 3 && v > 0 && v < 240)) {
      throw new Error("readPixels probe: empty/black frame");
    }
    return { info, attempts: handle.attempts,
      grab: async (t) => Buffer.from(await deadline(page.evaluate(t => window.__player.grab(t), t), timeout, "frame capture"), "base64"),
      close: async () => { try { await handle.close(); } finally { server?.close(); } } };
  } catch (error) {
    try { await handle?.close(); } finally { server?.close(); }
    throw error;
  }
}
