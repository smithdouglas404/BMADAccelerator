// Serves a generated app that is plain HTML/CSS/JS: node static-server.mjs <dir> <port>
import http from "http";
import { promises as fs } from "fs";
import path from "path";

const [dir, port] = process.argv.slice(2);
const root = path.resolve(dir);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://x");
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
      const body = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(body);
    } catch {
      try {
        const body = await fs.readFile(path.join(root, "index.html"));
        res.writeHead(200, { "Content-Type": TYPES[".html"] });
        res.end(body);
      } catch {
        res.writeHead(404).end("Not found");
      }
    }
  })
  .listen(Number(port), "0.0.0.0", () => console.log(`static preview on ${port}`));
