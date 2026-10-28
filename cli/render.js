import { readFile, writeFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { openBrowserScene } from "./browser.js";
import { python, pipeline } from "./environment.js";

export async function ensurePrepared(scene, force = false) {
  const cfg = JSON.parse(await readFile(path.join(scene, "scene.json"), "utf8"));
  const manifest = path.join(scene, "build/manifest.json");
  const ref = path.resolve(scene, cfg.reference || "reference.jpg");
  const key = (await pipeline(["prep-hash", scene])).stdout.trim();
  let old, stale = force;
  try {
    old = JSON.parse(await readFile(path.join(scene, "build/prep-state.json"), "utf8"));
    const mt = (await stat(manifest)).mtimeMs;
    stale ||= old.inputHash !== key || (await stat(ref)).mtimeMs > mt || (await stat(path.join(scene, "scene.json"))).mtimeMs > mt;
  } catch { stale = true; }
  if (stale) {
    console.log("prep", scene);
    await python(["prep", scene], { echo: true });
    await writeFile(path.join(scene, "build/prep-state.json"), JSON.stringify({ inputHash: key }));
  }
  return JSON.parse(await readFile(manifest, "utf8"));
}

function planArgs(scene, backend, opts) {
  return ["plan", scene, "--backend", backend, ...(opts.smoke ? ["--smoke"] : []), ...(opts.frames ? ["--frames", opts.frames] : [])];
}

export async function renderScene(scene, opts = {}) {
  await mkdir(path.join(scene, "build"), { recursive: true });
  const statusFile = path.join(scene, "build/last-run.json");
  const startedAt = new Date().toISOString();
  await writeFile(statusFile, JSON.stringify({ status: "running", startedAt, requestedBackend: opts.backend || "auto" }));
  try {
    const result = await render(scene, opts);
    const last = JSON.parse(result.stdout.trim().split("\n").at(-1));
    await writeFile(statusFile, JSON.stringify({ ...last, startedAt, finishedAt: new Date().toISOString() }, null, 2));
    return last;
  } catch (error) {
    await writeFile(statusFile, JSON.stringify({ status: "failed", startedAt, error: error.message }, null, 2));
    throw error;
  }
}

async function render(scene, opts = {}) {
  await ensurePrepared(scene, opts.forcePrep);
  const backend = opts.backend || "auto";
  if (!["auto", "cpu", "browser"].includes(backend)) throw new Error("--backend must be auto, cpu or browser");
  let capture;
  if (backend !== "cpu") {
    try { capture = await openBrowserScene(scene, { serverMode: opts.server }); }
    catch (error) {
      if (backend === "browser") throw error;
      console.error(`Browser unavailable; using CPU. ${error.message}`);
    }
  }
  if (!capture) {
    console.log("render backend=cpu");
    return pipeline(["render", scene, ...(opts.smoke ? ["--smoke"] : []), ...(opts.frames ? ["--frames", opts.frames] : [])], { echo: true });
  }
  console.log(`render backend=browser mode=${opts.server ? "server" : "inline"}`);
  try {
    // Probe actual readPixels too; no black/empty frame may count as a successful probe.
    const probe = await capture.grab(0);
    if (probe.length !== capture.info.w * capture.info.h * 4 || !probe.some((v, i) => i % 4 !== 3 && v > 0 && v < 240)) {
      throw new Error("browser probe: empty/black frame");
    }
    const p = JSON.parse((await pipeline(planArgs(scene, "browser", opts))).stdout);
    const t0 = Date.now();
    for (const [n, i] of p.missing.entries()) {
      const buf = await capture.grab(i / p.fps);
      if (buf.length !== p.grid * p.grid * 4) throw new Error(`frame ${i}: invalid byte length`);
      const dest = path.join(p.cache, `frame_${String(i).padStart(5, "0")}.rgba`);
      await writeFile(dest + ".tmp", buf); await rename(dest + ".tmp", dest);
      if (n % 120 === 0) console.log(`browser ${i + 1}/${p.total} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  } finally { await capture.close(); }
  return pipeline(["finish", scene], { echo: true });
}

export async function runParity(scene, opts = {}) {
  await ensurePrepared(scene, opts.forcePrep);
  const times = opts.times || "0,0.016666667,1.5,3,7.4,11.983333333";
  const parsed = times.split(",").map(Number);
  if (parsed.some(t => !Number.isFinite(t)) || !parsed.length) throw new Error("--times must be comma-separated seconds");
  const dir = opts.directory ? path.resolve(opts.directory, path.basename(scene)) : path.join(scene, "build/parity");
  await mkdir(dir, { recursive: true });
  const capture = await openBrowserScene(scene, { serverMode: opts.server });
  try {
    for (const [i, t] of parsed.entries()) await writeFile(path.join(dir, `browser-${i}.rgba`), await capture.grab(t));
  } finally { await capture.close(); }
  await pipeline(["parity", scene, "--directory", dir, "--times", times, "--max-ratio", opts.maxRatio || "0.0002"], { echo: true });
}
