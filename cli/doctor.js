import { mkdtemp, mkdir, writeFile, rm, cp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ROOT, chromePath, openBrowserScene } from "./browser.js";
import { PY, python, pipeline } from "./environment.js";
import { run } from "./process.js";

export async function doctor({ json = false } = {}) {
  const checks = [];
  const add = (stage, status, detail, error = null, suggestion = null) => checks.push({ stage, status, detail, error, suggestion });
  const check = async (stage, fn, suggestion) => {
    try { const result = await fn(); add(stage, "pass", result); return result; }
    catch (e) { add(stage, "fail", null, e.message, suggestion); return null; }
  };
  const node = await check("node", () => {
    if (+process.versions.node.split(".")[0] < 20) throw new Error(`Node ${process.version} is older than 20`);
    return process.version;
  }, "Install Node >=20.");
  const py = await check("python", async () => {
    const r = await run(PY, ["-c", "import sys,json;print(json.dumps(dict(version=sys.version,executable=sys.executable)))"], { timeout: 10000 });
    return JSON.parse(r.stdout);
  }, "Create a Python venv and set PYTHON to its python executable.");
  const modules = py && await check("python-modules", async () => {
    const r = await run(PY, ["-c", "import numpy,PIL,json;print(json.dumps(dict(numpy=numpy.__version__,Pillow=PIL.__version__)))"], { timeout: 10000 });
    return JSON.parse(r.stdout);
  }, `Run ${PY} -m pip install -r requirements.txt.`);
  const ffmpeg = modules && await check("ffmpeg", async () => {
    const r = await run(PY, ["-c", "import sys;sys.path.insert(0,sys.argv[1]);from pocketworld import get_ffmpeg_path;print(get_ffmpeg_path() or '')", path.join(ROOT, "tools")], { timeout: 10000 });
    if (!r.stdout.trim()) throw new Error("Neither imageio-ffmpeg nor system ffmpeg is available; GIF/PNG fallback remains available.");
    return r.stdout.trim();
  }, "Install imageio-ffmpeg in the selected Python environment, or system ffmpeg.");
  const chrome = await check("chrome-path", chromePath, "Set CHROME=/path/to/chrome, or use --backend cpu.");
  const workspace = await check("workspace-write", async () => {
    const p = await mkdtemp(path.join(ROOT, ".doctor-"));
    try { await writeFile(path.join(p, "write-test"), "ok"); return ROOT; } finally { await rm(p, { recursive: true, force: true }); }
  }, "Use a writable repository checkout.");
  let tmp;
  const temporary = await check("temporary-write", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "pocketworld-doctor-"));
    await writeFile(path.join(tmp, "write-test"), "ok"); return os.tmpdir();
  }, "Set TMPDIR to a writable directory.");
  let cpu = null, browser = null, encoded = null;
  try {
    let scene;
    if (temporary && modules) {
      scene = path.join(tmp, "scene"); await mkdir(scene);
      const example = path.join(ROOT, "examples/rain-bus-stop");
      await cp(path.join(example, "scene.json"), path.join(scene, "scene.json"));
      await cp(path.join(example, "reference.jpg"), path.join(scene, "reference.jpg"));
      try { await cp(path.join(example, "build"), path.join(scene, "build"), { recursive: true, filter: s => !s.split(path.sep).includes("frames") && !s.split(path.sep).includes("parity") }); }
      catch { await python(["prep", scene]); }
      cpu = await check("cpu-frame", async () => {
        const r = await pipeline(["frame", scene, "--directory", path.join(tmp, "cpu.png")], { timeout: 20000 });
        return JSON.parse(r.stdout);
      }, "Check Python modules and build textures; run prep again.");
    }
    if (chrome && scene) {
      let capture;
      try {
        capture = await openBrowserScene(scene, { onStage: (stage, detail) => add(stage, "pass", detail) });
        const data = await capture.grab(0);
        if (!data.some((v, i) => i % 4 !== 3 && v > 0 && v < 240)) throw new Error("readPixels returned a blank/black frame");
        add("browser-frame", "pass", { bytes: data.length }); browser = true;
      } catch (e) { add("browser-probe", "fail", null, e.message, "Use --backend cpu; host IPC/WebGL restrictions cannot always be fixed with flags."); }
      finally { await capture?.close(); }
    } else add("browser-probe", "skip", "Chrome or Python prerequisites unavailable", null, "CPU is independent of Chrome.");
    if (ffmpeg && temporary) encoded = await check("short-encode", async () => {
      await run(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=16x16:r=60", "-frames:v", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(tmp, "encode.mp4")], { timeout: 20000 });
      return "libx264: 2 frames encoded";
    }, "Check the ffmpeg binary and libx264 support.");
  } finally { if (tmp) await rm(tmp, { recursive: true, force: true }); }
  const usable = Boolean(node && modules && workspace && temporary && cpu && (!ffmpeg || encoded));
  const result = { usable, backend: usable ? (browser ? "browser" : "cpu") : null,
    output: usable ? (encoded ? "mp4+gif+png" : "gif+png") : null, checks };
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const c of checks) console.log(`[${c.status.toUpperCase()}] ${c.stage}: ${c.error || JSON.stringify(c.detail)}${c.suggestion ? `\n  ${c.suggestion}` : ""}`);
    console.log(`render backend: ${result.backend || "unavailable"}; output: ${result.output || "unavailable"}`);
  }
  return result;
}
