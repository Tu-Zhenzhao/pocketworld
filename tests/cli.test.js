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
test('pixel init and study CLI work in a fresh CPU-only workspace',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pw-cli-study-')),scene=path.join(temp,'scene'),out=path.join(temp,'study');
 await run(process.execPath,['cli/pocketworld.js','init',scene,'--template','pixel']);
 await run(process.execPath,['cli/pocketworld.js','study',scene,'--out',out,'--times','0,1.5,6','--scale','3','--backend','cpu']);
 const result=JSON.parse(await fs.readFile(path.join(out,'study.json'),'utf8'));assert.equal(result.samples.length,3);assert.equal(result.backend,'cpu');assert.equal(result.aestheticApproval,'not-assessed');await fs.access(path.join(out,'scenes/current/ART_DIRECTION.md'));
});
