import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../cli/process.js";

test("missing executable rejects promptly", async () => {
  await assert.rejects(run("/nonexistent-pocketworld-python", [], { timeout: 1000 }), /ENOENT/);
});
test("nonzero exit retains raw stderr", async () => {
  await assert.rejects(run(process.execPath, ["-e", 'console.error("encoder exploded");process.exit(3)']), /exit 3.*\nencoder exploded/);
});
test("deadline terminates child processes", async () => {
  const t = Date.now();
  await assert.rejects(run(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 100 }), /timeout/);
  assert(Date.now() - t < 3000);
});
