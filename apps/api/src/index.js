import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync, createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { connectNats } from "./nats.js";
import Redis from "ioredis";
import { createPool, migrate } from "./db.js";
import { createS3 } from "./s3.js";
import { TOOLS, listTools } from "./tools.js";

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const SUBJECT = process.env.NATS_SUBJECT || "anvil.jobs";
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIRS = [
  path.join(__dirname, "samples"),
  path.join(__dirname, "..", "samples"),
  path.join(process.cwd(), "samples"),
  path.join(process.cwd(), "apps", "api", "samples"),
].filter((d) => existsSync(d));
const SAMPLE_DIR = SAMPLE_DIRS[0] || path.join(__dirname, "samples");

const STATIC = [
  path.join(__dirname, "public"),
  path.join(__dirname, "..", "public"),
].find((d) => existsSync(path.join(d, "index.html")));

const pool = createPool(DATABASE_URL);
await migrate(pool);
const s3 = createS3();
const redis = REDIS_URL
  ? new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true })
  : null;
if (redis) {
  try {
    await redis.connect();
  } catch (e) {
    console.error("redis", e.message);
  }
}

const nc = await connectNats();
console.log("nats connected");

const app = Fastify({ logger: true, bodyLimit: MAX_UPLOAD + 1024 * 100 });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD, files: 30 } });

const SAMPLE_META = {
  "sample-report": { label: "Report", kind: "pdf", pages: 4 },
  "sample-brief": { label: "Brief", kind: "pdf", pages: 3 },
  "sample-photo": { label: "Photo", kind: "image", pages: 1 },
};

function listSampleMeta() {
  if (!existsSync(SAMPLE_DIR)) return [];
  const files = readdirSync(SAMPLE_DIR).filter((f) => /\.(pdf|png|jpe?g|webp)$/i.test(f));
  return files.filter((f) => {
    const id = f.replace(/\.(pdf|png|jpe?g|webp)$/i, "");
    return Boolean(SAMPLE_META[id]);
  }).map((f) => {
    const st = statSync(path.join(SAMPLE_DIR, f));
    const id = f.replace(/\.(pdf|png|jpe?g|webp)$/i, "");
    const ext = (f.match(/\.([^.]+)$/) || [,""])[1].toLowerCase();
    const meta = SAMPLE_META[id] || {};
    const kind = meta.kind || (ext === "pdf" ? "pdf" : "image");
    return {
      id,
      filename: f,
      bytes: st.size,
      kind,
      pages: meta.pages || null,
      label: meta.label || id.replace(/sample-/i, "").replace(/-/g, " "),
      mimetype:
        ext === "pdf"
          ? "application/pdf"
          : ext === "png"
            ? "image/png"
            : "image/jpeg",
    };
  }).sort((a, b) => {
    const order = { "sample-report": 0, "sample-brief": 1, "sample-photo": 2 };
    return (order[a.id] ?? 9) - (order[b.id] ?? 9);
  });
}

function publicJob(j) {
  return {
    id: j.id,
    tool: j.tool,
    status: j.status,
    progress: j.progress,
    message: j.message,
    options: j.options,
    output_name: j.output_name,
    input_bytes: j.input_bytes != null ? Number(j.input_bytes) : null,
    output_bytes: j.output_bytes != null ? Number(j.output_bytes) : null,
    error: j.error,
    created_at: j.created_at,
    started_at: j.started_at,
    finished_at: j.finished_at,
  };
}

function safeName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
}

async function enqueueJob({ tool, options, files }) {
  const def = TOOLS[tool];
  if (!def) throw Object.assign(new Error("unknown tool"), { status: 400, tools: listTools() });
  if (files.length < def.minFiles) {
    throw Object.assign(new Error(`need at least ${def.minFiles} file(s)`), { status: 400 });
  }
  if (files.length > def.maxFiles) {
    throw Object.assign(new Error(`max ${def.maxFiles} file(s)`), { status: 400 });
  }
  if (tool === "split") {
    if (!options.from || !options.to || options.from < 1 || options.to < options.from) {
      throw Object.assign(new Error("split needs from/to (1-based, to ≥ from)"), { status: 400 });
    }
  }

  const jobId = nanoid(12);
  const inputKeys = [];
  let inputBytes = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    inputBytes += f.size;
    const key = `jobs/${jobId}/in/${String(i).padStart(2, "0")}-${safeName(f.filename)}`;
    await s3.put(key, f.buffer, f.mimetype || "application/pdf");
    inputKeys.push({ key, name: f.filename, size: f.size, mimetype: f.mimetype });
  }

  await pool.query(
    `INSERT INTO jobs (id, tool, status, progress, message, input_keys, options, input_bytes)
     VALUES ($1,$2,'queued',0,'Queued',$3,$4,$5)`,
    [jobId, tool, JSON.stringify(inputKeys), JSON.stringify(options), inputBytes]
  );

  if (redis) {
    await redis.set(
      `job:${jobId}`,
      JSON.stringify({ status: "queued", progress: 0, message: "Queued" }),
      "EX",
      3600
    );
  }
  nc.publish(SUBJECT, new TextEncoder().encode(JSON.stringify({ jobId })));
  const { rows } = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
  return publicJob(rows[0]);
}

app.get("/api/health", async () => {
  await pool.query("SELECT 1");
  return {
    ok: true,
    service: "anvil-api",
    product: "Anvil PDF Forge",
    time: new Date().toISOString(),
    auth: "none",
    stack: ["anvilapi", "anvilworker", "anvildb", "anvilcache", "anvilbus", "anvilstore"],
    samples: listSampleMeta().length,
  };
});

app.get("/api/tools", async () => ({ tools: listTools(), auth: false }));
app.get("/api/samples", async () => ({ samples: listSampleMeta() }));

app.get("/api/samples/:id", async (req, reply) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9._-]/g, "");
  const candidates = [
    path.join(SAMPLE_DIR, id),
    path.join(SAMPLE_DIR, `${id}.pdf`),
    path.join(SAMPLE_DIR, `${id}.jpg`),
    path.join(SAMPLE_DIR, `${id}.jpeg`),
    path.join(SAMPLE_DIR, `${id}.png`),
  ];
  const file = candidates.find((f) => existsSync(f));
  if (!file) return reply.code(404).send({ error: "sample not found" });
  const ext = path.extname(file).toLowerCase();
  const type =
    ext === ".pdf" ? "application/pdf" :
    ext === ".png" ? "image/png" :
    "image/jpeg";
  reply.header("content-type", type);
  reply.header("content-disposition", `inline; filename="${path.basename(file)}"`);
  return reply.send(createReadStream(file));
});

app.get("/api/jobs", async (req) => {
  const limit = Math.min(50, Number(req.query.limit || 20));
  const { rows } = await pool.query(
    `SELECT id, tool, status, progress, message, output_name, input_bytes, output_bytes,
            created_at, started_at, finished_at, error
     FROM jobs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return { jobs: rows.map(publicJob) };
});

app.get("/api/jobs/:id", async (req, reply) => {
  const { rows } = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return reply.code(404).send({ error: "job not found" });
  const job = rows[0];
  let downloadUrl = null;
  if (job.status === "done" && job.output_key) {
    downloadUrl = await s3.signedGet(job.output_key, 3600);
  }
  let live = null;
  if (redis) {
    try {
      const raw = await redis.get(`job:${job.id}`);
      if (raw) live = JSON.parse(raw);
    } catch {}
  }
  return { job: publicJob(job), downloadUrl, live };
});

/** One-click demo: no upload needed */
app.post("/api/demo", async (req, reply) => {
  const body = req.body || {};
  const tool = String(body.tool || "merge");
  const sampleIds = Array.isArray(body.samples)
    ? body.samples.map(String)
    : tool === "merge"
      ? ["sample-a", "sample-b"]
      : tool === "split"
        ? ["sample-b"]
        : ["sample-a"];
  const options = {
    from: Number(body.from || 1),
    to: Number(body.to || 2),
  };
  const files = [];
  for (const sid of sampleIds) {
    const id = String(sid).replace(/[^a-zA-Z0-9._-]/g, "");
    const candidates = [
      path.join(SAMPLE_DIR, id),
      path.join(SAMPLE_DIR, `${id}.pdf`),
      path.join(SAMPLE_DIR, `${id}.jpg`),
      path.join(SAMPLE_DIR, `${id}.jpeg`),
      path.join(SAMPLE_DIR, `${id}.png`),
    ];
    const file = candidates.find((f) => existsSync(f));
    if (!file) {
      return reply.code(400).send({ error: `missing sample ${id}`, available: listSampleMeta() });
    }
    const buffer = readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    const mimetype =
      ext === ".pdf" ? "application/pdf" :
      ext === ".png" ? "image/png" :
      "image/jpeg";
    files.push({
      filename: path.basename(file),
      mimetype,
      buffer,
      size: buffer.length,
    });
  }
  try {
    const job = await enqueueJob({ tool, options, files });
    return reply.code(201).send({
      job,
      message: "Queued",
    });
  } catch (e) {
    return reply.code(e.status || 500).send({ error: e.message, tools: e.tools });
  }
});

app.post("/api/jobs", async (req, reply) => {
  const parts = req.parts();
  let tool = null;
  const options = {};
  const files = [];
  for await (const part of parts) {
    if (part.type === "file") {
      const buf = await part.toBuffer();
      files.push({
        filename: part.filename || "file.pdf",
        mimetype: part.mimetype || "application/octet-stream",
        buffer: buf,
        size: buf.length,
      });
    } else {
      const v = part.value;
      if (part.fieldname === "tool") tool = String(v);
      else if (part.fieldname === "from") options.from = Number(v);
      else if (part.fieldname === "to") options.to = Number(v);
      else options[part.fieldname] = v;
    }
  }
  try {
    const job = await enqueueJob({ tool, options, files });
    return reply.code(201).send({ job, message: "Queued" });
  } catch (e) {
    return reply.code(e.status || 500).send({ error: e.message, tools: e.tools });
  }
});

if (STATIC) {
  await app.register(fastifyStatic, { root: STATIC, prefix: "/", wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) return reply.code(404).send({ error: "not found" });
    return reply.sendFile("index.html");
  });
}

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`Anvil API on :${PORT}; samples=${SAMPLE_DIR}`);
