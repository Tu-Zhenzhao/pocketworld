/**
 * Playground server. Static files from the repo root, a scene list,
 * and a reload ping when a scene or the runtime changes.
 *
 *   npm run dev
 *   open http://127.0.0.1:8787/playground/
 */
import { createServer } from "node:http";
import { readFile, readdir, stat, watch } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 8787);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

const clients = new Set();

async function scenes() {
  const dir = path.join(root, "examples");
  const order = ["rain-bus-stop", "fishing", "basketball", "juggler"];
  const names = (await readdir(dir)).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const out = [];
  for (const name of names) {
    const file = path.join(dir, name, "scene.js");
    if (!existsSync(file)) continue;
    const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
    const spec = mod.default;
    out.push({
      id: spec.id || name,
      name: spec.name || name,
      src: `/examples/${name}/scene.js`,
      duration: spec.duration,
      fps: spec.fps,
      poster: spec.poster || 0,
    });
  }
  return out;
}

function send(res, status, body, type) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/scenes") {
      send(res, 200, JSON.stringify(await scenes()), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("data: hello\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/playground/";
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = path.normalize(path.join(root, pathname));
    if (!file.startsWith(root)) {
      send(res, 403, "no", "text/plain");
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      send(res, 404, "not found", "text/plain");
      return;
    }
    const body = await readFile(file);
    send(res, 200, body, types[path.extname(file)] || "application/octet-stream");
  } catch (err) {
    send(res, 500, String(err && err.stack || err), "text/plain; charset=utf-8");
  }
});

function broadcast() {
  for (const res of clients) res.write("data: reload\n\n");
}

let timer = null;
async function watchDir(rel) {
  const dir = path.join(root, rel);
  if (!existsSync(dir)) return;
  try {
    const watcher = watch(dir, { recursive: true });
    for await (const event of watcher) {
      if (!event.filename || event.filename.includes("node_modules")) continue;
      clearTimeout(timer);
      timer = setTimeout(broadcast, 120);
    }
  } catch (err) {
    console.error("watch failed", rel, err.message);
  }
}

server.listen(port, "127.0.0.1", () => {
  console.log(`pocketworld  http://127.0.0.1:${port}/playground/`);
  console.log(`gallery      http://127.0.0.1:${port}/examples/`);
});

watchDir("examples");
watchDir("src");
watchDir("playground");
