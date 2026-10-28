import { spawn } from "node:child_process";

// All helpers have a deadline and observe spawn errors as well as exit status.
export function run(command, args, { timeout = 600000, echo = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    const kill = () => {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* already exited, or spawn failed */ }
    };
    const interrupted = () => { timedOut = true; kill(); };
    process.once("SIGINT", interrupted); process.once("SIGTERM", interrupted);
    const cleanup = () => {
      clearTimeout(timer);
      process.off("SIGINT", interrupted); process.off("SIGTERM", interrupted);
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeout);
    child.stdout.on("data", (d) => { stdout += d; if (echo) process.stdout.write(d); });
    child.stderr.on("data", (d) => { stderr += d; if (echo) process.stderr.write(d); });
    child.once("error", (e) => { cleanup(); reject(e); });
    child.once("close", (code, signal) => {
      cleanup();
      if (code === 0 && !timedOut) resolve({ stdout, stderr });
      else reject(new Error(`${command}: ${timedOut ? "timeout" : `exit ${code ?? signal}`}\n${stderr || stdout}`));
    });
  });
}

export async function deadline(promise, ms, stage) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${stage}: timed out after ${ms}ms`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
