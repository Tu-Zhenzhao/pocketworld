// Optional repeatable UI verification; PLAYWRIGHT_MODULE may point at an installed
// Playwright module outside this dependency-free browser library.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { ROOT, chromePath, openBrowserScene } from "../cli/browser.js";
import { startServer } from "../cli/server.js";

const { server, port } = await startServer(ROOT);
let browser;
try {
  browser = await chromium.launch({ executablePath: chromePath(), timeout: 15000,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/playground/`, { timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll("pocket-world")].every(e => e.player?.ready), { timeout: 30000 });
  const info = await page.evaluate(() => [...document.querySelectorAll("pocket-world")].map(e => ({ ...e.player.info(), changes: e.player.grab(0) !== e.player.grab(1) })));
  assert.equal(info.length, 5);
  for (const scene of info) { assert.equal(scene.w, 1040); assert.equal(scene.loop, 12); assert(scene.changes); }
  await page.setViewportSize({ width: 390, height: 844 });
  const fits = await page.evaluate(() => [...document.querySelectorAll("pocket-world canvas")].every(c => c.getBoundingClientRect().width <= innerWidth));
  assert(fits); assert.deepEqual(errors, []);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll("pocket-world")].every(e => e.player?.ready), { timeout: 30000 });
  const a = await page.locator("canvas").first().evaluate(c => c.toDataURL());
  await page.waitForTimeout(150);
  const b = await page.locator("canvas").first().evaluate(c => c.toDataURL());
  assert.equal(a, b);
  console.log("PASS: 5 WebGL components; motion, 390px layout, reduced-motion poster, no page errors");
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
}

// Both production capture modes must produce the same bytes. The inline mode
// rejects all HTTP/file requests internally, so this also tests offline capture.
const scene = `${ROOT}/examples/rain-bus-stop`;
const inline = await openBrowserScene(scene);
let baseline;
try { baseline = await inline.grab(3); } finally { await inline.close(); }
const legacy = await openBrowserScene(scene, { serverMode: true });
try { assert.deepEqual(await legacy.grab(3), baseline); } finally { await legacy.close(); }
console.log("PASS: inline (HTTP blocked) == legacy server capture, byte for byte");

// Regression: failed Puppeteer pipe-launch teardown used to outlive its timeout.
const { launchBrowser } = await import("../cli/browser.js");
const { readdir } = await import("node:fs/promises");
const os = await import("node:os");
const before = new Set((await readdir(os.tmpdir())).filter(n => n.startsWith("pocketworld-chrome-")));
const savedFlags = process.env.CHROME_FLAGS;
const started = Date.now();
try {
  process.env.CHROME_FLAGS = "--user-data-dir=/dev/null";
  await assert.rejects(launchBrowser({ timeout: 1500 }), e => [1, 2, 3].every(i => e.message.includes(`attempt ${i}:`)));
} finally {
  if (savedFlags == null) delete process.env.CHROME_FLAGS;
  else process.env.CHROME_FLAGS = savedFlags;
}
assert(Date.now() - started < 9000);
const after = (await readdir(os.tmpdir())).filter(n => n.startsWith("pocketworld-chrome-") && !before.has(n));
assert.deepEqual(after, []);
console.log("PASS: bad Chrome flags produce 3 bounded failures and leave no temporary profile");
