import { readFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
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
  const variants = [[], ["--no-zygote"], ["--no-zygote", "--single-process"]];
  for (let i = 0; i < variants.length; i++) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pocketworld-chrome-"));
    let child, browser, closed = false, stderr = "";
    const kill = () => {
      if (!child?.pid) return;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* process group has already exited */ }
    };
    const close = async () => {
      if (closed) return;
      closed = true;
      process.off("SIGINT", interrupted); process.off("SIGTERM", interrupted);
      try { if (browser) await deadline(browser.close(), 1000, "browser close"); }
      catch { /* kill below also covers unresponsive CDP */ }
      finally {
        kill();
        if (child && child.exitCode === null && child.signalCode === null) {
          await deadline(new Promise(r => child.once("close", r)), 1000, "Chrome process close").catch(() => {});
        }
        await rm(dir, { recursive: true, force: true });
      }
    };
    const interrupted = () => { close().finally(() => process.exit(130)); };
    process.once("SIGINT", interrupted); process.once("SIGTERM", interrupted);
    try {
      // Manage the process ourselves: puppeteer.launch() can remain stuck in its
      // own failed-launch teardown after its launch timeout has expired.
      child = spawn(executablePath, ["--headless=new", `--user-data-dir=${dir}`,
        "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check",
        "--disable-background-networking", "--disable-extensions",
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox",
        "--ignore-gpu-blocklist", "--disable-dev-shm-usage", "--disable-crash-reporter",
        "--disable-breakpad", "--disable-crashpad-for-testing", ...variants[i],
        ...(process.env.CHROME_FLAGS || "").split(/\s+/).filter(Boolean), "about:blank"],
        { detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", () => {});
      const endpoint = await deadline(new Promise((resolve, reject) => {
        child.stderr.on("data", d => {
          stderr += d.toString();
          const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
          if (match) resolve(match[1]);
        });
        child.once("error", reject);
        child.once("exit", (code, signal) => reject(new Error(`Chrome exited ${code ?? signal}`)));
      }), timeout, "Chrome startup");
      browser = await deadline(puppeteer.connect({ browserWSEndpoint: endpoint, protocolTimeout: timeout }), timeout, "Chrome CDP connection");
      onStage("browser-launch", { executablePath, attempt: i + 1, attempts });
      return { browser, close, attempts };
    } catch (error) {
      await close();
      attempts.push({ attempt: i + 1, error: `${error.message}\n${stderr}`.trim() });
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
