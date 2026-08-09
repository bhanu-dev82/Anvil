import { StringCodec } from "nats";
import { connectNats } from "./nats.js";
import Redis from "ioredis";
import pg from "pg";
import { createS3 } from "./s3.js";
import { mergePdfs, splitPdf, compressPdf, imagesToPdf, whichTools } from "./pdf.js";

const DATABASE_URL = process.env.DATABASE_URL;
const NATS_URL = process.env.NATS_URL;
const REDIS_URL = process.env.REDIS_URL;
const SUBJECT = process.env.NATS_SUBJECT || "anvil.jobs";
const QUEUE = process.env.NATS_QUEUE || "anvil-workers";

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const s3 = createS3();
const redis = REDIS_URL ? new Redis(REDIS_URL, { maxRetriesPerRequest: 2 }) : null;
const sc = StringCodec();

async function setProgress(jobId, progress, message, status = "running") {
  if (redis) {
    await redis.set(
      `job:${jobId}`,
      JSON.stringify({ status, progress, message, at: Date.now() }),
      "EX",
      3600
    );
  }
  await pool.query(
    `UPDATE jobs SET status=$2, progress=$3, message=$4, started_at = COALESCE(started_at, NOW()) WHERE id=$1`,
    [jobId, status, progress, message]
  );
}

async function processJob(jobId) {
  const { rows } = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
  const job = rows[0];
  if (!job) return;
  if (job.status === "done" || job.status === "failed") return;

  // claim
  const claim = await pool.query(
    `UPDATE jobs SET status='running', started_at=COALESCE(started_at,NOW()), progress=5, message='Running'
     WHERE id=$1 AND status IN ('queued','running') RETURNING *`,
    [jobId]
  );
  if (!claim.rows[0]) return;

  try {
    await setProgress(jobId, 10, "Downloading");
    const inputs = job.input_keys || [];
    const buffers = [];
    for (const item of inputs) {
      buffers.push(await s3.getBuffer(item.key));
    }

    await setProgress(jobId, 35, `Processing…`);
    let out;
    let outName = "result.pdf";
    const opts = job.options || {};

    if (job.tool === "merge") {
      out = await mergePdfs(buffers);
      outName = "merged.pdf";
    } else if (job.tool === "split") {
      out = await splitPdf(buffers[0], Number(opts.from), Number(opts.to));
      outName = `pages-${opts.from}-${opts.to}.pdf`;
    } else if (job.tool === "compress") {
      out = await compressPdf(buffers[0]);
      outName = "compressed.pdf";
    } else if (job.tool === "imagespdf") {
      out = await imagesToPdf(
        buffers,
        inputs.map((i) => i.name)
      );
      outName = "images.pdf";
    } else {
      throw new Error(`unknown tool ${job.tool}`);
    }

    await setProgress(jobId, 80, "Uploading");
    const outKey = `jobs/${jobId}/out/${outName}`;
    await s3.put(outKey, out, "application/pdf");

    await pool.query(
      `UPDATE jobs SET status='done', progress=100, message='Done', output_key=$2, output_name=$3,
         output_bytes=$4, finished_at=NOW(), error=NULL WHERE id=$1`,
      [jobId, outKey, outName, out.length]
    );
    if (redis) {
      await redis.set(
        `job:${jobId}`,
        JSON.stringify({ status: "done", progress: 100, message: "Done", output_bytes: out.length }),
        "EX",
        3600
      );
    }
    console.log("job done", jobId, job.tool, out.length);
  } catch (err) {
    console.error("job failed", jobId, err);
    await pool.query(
      `UPDATE jobs SET status='failed', progress=100, message='Failed', error=$2, finished_at=NOW() WHERE id=$1`,
      [jobId, String(err.message || err).slice(0, 2000)]
    );
    if (redis) {
      await redis.set(
        `job:${jobId}`,
        JSON.stringify({ status: "failed", progress: 100, message: String(err.message || err) }),
        "EX",
        3600
      );
    }
  }
}

const tools = await whichTools();
console.log("Anvil worker tools:", tools);
if (!tools.qpdf) console.warn("WARNING: qpdf missing — install in run.prepareCommands");

const nc = await connectNats();
const sub = nc.subscribe(SUBJECT, { queue: QUEUE });
console.log(`Anvil worker listening on ${SUBJECT} queue=${QUEUE}`);

// also reclaim stuck queued jobs every 10s
setInterval(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM jobs WHERE status='queued' AND created_at < NOW() - INTERVAL '3 seconds' ORDER BY created_at ASC LIMIT 5`
    );
    for (const r of rows) processJob(r.id).catch(console.error);
  } catch (e) {
    console.error("reclaim", e.message);
  }
}, 10000);

for await (const m of sub) {
  try {
    const msg = JSON.parse(sc.decode(m.data));
    if (msg.jobId) processJob(msg.jobId).catch(console.error);
  } catch (e) {
    console.error("msg", e);
  }
}
