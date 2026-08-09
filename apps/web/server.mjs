import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const API_ORIGIN = (process.env.API_ORIGIN || "http://anvilapi:3000").replace(/\/$/, "");
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const mime = {
  ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".json": "application/json", ".html": "text/html", ".pdf": "application/pdf",
};

function isApi(url) {
  return url === "/api" || url.startsWith("/api/") || url.startsWith("/api?");
}

function proxy(req, res) {
  let target;
  try { target = new URL(req.url, API_ORIGIN); }
  catch {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad API_ORIGIN" }));
    return;
  }
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;
  delete headers["content-length"];
  const upstream = http.request(target, { method: req.method, headers }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Anvil API unavailable", detail: err.message }));
  });
  req.pipe(upstream);
}

async function serve(req, res) {
  if (req.url === "/healthz" || req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "anvil-web", api: API_ORIGIN }));
    return;
  }
  const urlPath = decodeURIComponent(new URL(req.url || "/", "http://local").pathname);
  const requested = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  let file = path.resolve(dist, requested);
  if (!file.startsWith(dist)) { res.writeHead(403).end("Forbidden"); return; }
  try {
    const st = await fs.stat(file);
    if (st.isDirectory()) file = path.join(file, "index.html");
  } catch { file = path.join(dist, "index.html"); }
  try {
    const st = await fs.stat(file);
    res.writeHead(200, {
      "content-type": mime[path.extname(file)] || "application/octet-stream",
      "content-length": st.size,
      "cache-control": file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>Anvil</title><body style='background:#0b0c0f;color:#e8eaef;font-family:system-ui;padding:2rem'><h1>Anvil heating up…</h1><p>Static build missing — redeploy web.</p></body>");
  }
}

http.createServer((req, res) => {
  try {
    if (isApi(req.url || "")) return proxy(req, res);
    return serve(req, res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500).end("error");
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Anvil web :${PORT} → ${API_ORIGIN}`);
});
