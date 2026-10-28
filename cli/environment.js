import path from "node:path";
import { ROOT } from "./browser.js";
import { run } from "./process.js";
export const PY = process.env.PYTHON || "python3";
export const TOOL = path.join(ROOT, "tools/pocketworld.py");
export const PIPELINE = path.join(ROOT, "tools/render_pipeline.py");
export function python(args, options = {}) { return run(PY, [TOOL, ...args], options); }
export function pipeline(args, options = {}) { return run(PY, [PIPELINE, ...args], options); }
