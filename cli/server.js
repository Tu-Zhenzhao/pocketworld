import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".mp4": "video/mp4", ".css": "text/css", ".md": "text/markdown; charset=utf-8" };

export function startServer(root, port = 0) {
  const server = createServer(async (req, res) => {
    try {
      let name = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
      if (name.endsWith("/")) name += "index.html";
      const file = path.resolve(root, "." + name);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch { res.writeHead(404).end("not found"); }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}
