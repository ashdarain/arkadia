#!/usr/bin/env node
/**
 * Arkadia — tiny static file server (no dependencies).
 *
 *   node tools/serve.mjs              → http://localhost:8080 (this computer only)
 *   node tools/serve.mjs --port 3000
 *   node tools/serve.mjs --lan        → also reachable from other devices on your network
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const PORT = Number(portArg >= 0 ? args[portArg + 1] : process.env.PORT) || 8080;
const HOST = args.includes("--lan") ? "0.0.0.0" : "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// Only serve what the site needs; keep tools/ and dotfiles private.
const BLOCKED = /^\/(tools|node_modules)(\/|$)|\/\./;

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400).end("Bad request"); return; }

  if (BLOCKED.test(urlPath)) { res.writeHead(404).end("Not found"); return; }
  if (urlPath.endsWith("/")) urlPath += "index.html";

  const file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403).end("Forbidden"); return; }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Arkadia is running at http://localhost:${PORT}`);
  if (HOST === "0.0.0.0") {
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const n of nets ?? []) if (n.family === "IPv4" && !n.internal) console.log(`  on your network: http://${n.address}:${PORT}`);
    }
  }
  console.log("Press Ctrl+C to stop.");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(`Port ${PORT} is already in use. Try: node tools/serve.mjs --port ${PORT + 1}`);
  else console.error(e.message);
  process.exit(1);
});
