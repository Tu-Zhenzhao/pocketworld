import { mkdtemp, rm } from "node:fs/promises";
import { existsSync,readFileSync } from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import puppeteer from "puppeteer-core";



// Self-contained launcher; installed Skills never depend on repository CLI files.
async function deadline(promise, ms, stage) {
 let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${stage}: timeout`)),ms)})])}finally{clearTimeout(timer)}
}
export function chromePath() {
  // An explicit override is authoritative, including a nonexistent path.
  if (process.env.CHROME) {
    if (!existsSync(process.env.CHROME)) throw new Error(`CHROME does not exist: ${process.env.CHROME}`);
    return process.env.CHROME;
  }
  let cached;try{cached=JSON.parse(readFileSync(new URL('./browser.json',import.meta.url),'utf8')).executablePath}catch{}
  const found = [cached,
    process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'),"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean).find(existsSync);
  if (!found) throw new Error("Chrome not found. Set CHROME=/path/to/chrome. Use --backend cpu for native software rendering.");
  return found;
}

// A CDP target can close during initialization before Puppeteer has a main frame.
// Verify a usable document instead of returning that half-initialized page.
export async function readyPage(browser,{timeout=15000,attempts=3}={}) {
 const errors=[];
 for(let i=0;i<attempts;i++){
  let page;try{page=await deadline(browser.newPage(),timeout,'page creation');await deadline(page.goto('about:blank',{waitUntil:'load',timeout}),timeout,'page initialization');await deadline(page.evaluate(()=>document.readyState),timeout,'page document');return page}
  catch(error){errors.push(error.message);if(page)await deadline(page.close(),1000,'failed page cleanup').catch(()=>{});if(!browser.isConnected()||!/main frame too early|Target closed|Session closed|Connection closed|timed out|timeout|closed page/i.test(error.message))throw error}
 }
 throw Error(`browser-page: no ready document after ${attempts} attempts\n${errors.join('\n')}`);
}

export async function launchBrowser({ timeout = 30000, onStage = () => {} } = {}) {
  const executablePath = chromePath(), attempts = [];
  // Retry the normal multiprocess launch; process-model flags can break GPU/FD ownership on Linux.
  const launchAttempts = 3;
  for (let i = 0; i < launchAttempts; i++) {
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
        "--disable-breakpad", "--disable-crashpad-for-testing",
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
      const probe=await readyPage(browser,{timeout,attempts:2});await probe.close();
      onStage("browser-launch", { executablePath, attempt: i + 1, attempts });
      return { browser, close, attempts, newPage:()=>readyPage(browser,{timeout}) };
    } catch (error) {
      await close();
      attempts.push({ attempt: i + 1, error: `${error.message}\n${stderr}`.trim() });
    }
  }
  throw new Error(`browser-launch: all attempts failed\n${attempts.map(x => `attempt ${x.attempt}: ${x.error}`).join("\n")}`);
}
