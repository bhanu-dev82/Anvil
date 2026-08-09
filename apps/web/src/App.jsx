import { useEffect, useState, useCallback } from "react";

const API = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");

async function api(path, opts) {
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data;
}

function bytes(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  n = Number(n);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function elapsed(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end) - new Date(start);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const TOOLS = [
  { id: "merge",     icon: "📎", name: "Merge",        blurb: "Stitch multiple PDFs into one seamless document" },
  { id: "split",     icon: "✂️", name: "Split",        blurb: "Extract a precise page range into a new file" },
  { id: "compress",  icon: "🗜️", name: "Compress",     blurb: "Shrink file size for email and uploads" },
  { id: "imagespdf", icon: "🖼️", name: "Images → PDF", blurb: "Stack photos or scans into ordered pages" },
];

const ARCH = [
  { id: "client",  icon: "🌐", name: "Browser",     type: "You",             cls: "" },
  { id: "api",     icon: "⚡", name: "anvilapi",    type: "Fastify · Node",  cls: "runtime" },
  { id: "bus",     icon: "📡", name: "anvilbus",    type: "NATS PubSub",     cls: "infra" },
  { id: "worker",  icon: "⚙️", name: "anvilworker", type: "Node Worker",     cls: "runtime" },
  { id: "store",   icon: "📦", name: "anvilstore",  type: "S3 Storage",      cls: "storage" },
  { id: "cache",   icon: "🚀", name: "anvilcache",  type: "Valkey",          cls: "infra" },
  { id: "db",      icon: "🗄️", name: "anvildb",     type: "PostgreSQL",      cls: "data" },
];

export default function App() {
  const [tool, setTool] = useState("merge");
  const [samples, setSamples] = useState([]);
  const [files, setFiles] = useState([]);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(2);
  const [job, setJob] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const refreshHistory = useCallback(() => {
    api("/api/jobs?limit=10").then((d) => setHistory(d.jobs || [])).catch(() => {});
  }, []);

  useEffect(() => {
    api("/api/samples").then((d) => setSamples(d.samples || [])).catch(() => {});
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!job?.id || job.status === "done" || job.status === "failed") return;
    const t = setInterval(async () => {
      try {
        const d = await api(`/api/jobs/${job.id}`);
        setJob(d.job);
        setDownloadUrl(d.downloadUrl || null);
        if (d.job.status === "done" || d.job.status === "failed") refreshHistory();
      } catch {}
    }, 800);
    return () => clearInterval(t);
  }, [job?.id, job?.status, refreshHistory]);

  async function runDemo(demoTool, sampleList) {
    setErr("");
    setBusy(true);
    setDownloadUrl(null);
    setTool(demoTool);
    setFiles([]);
    try {
      const data = await api("/api/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: demoTool, samples: sampleList, from: 1, to: 2 }),
      });
      setJob(data.job);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function runUpload(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    setDownloadUrl(null);
    try {
      const fd = new FormData();
      fd.append("tool", tool);
      if (tool === "split") {
        fd.append("from", String(from));
        fd.append("to", String(to));
      }
      for (const f of files) fd.append("files", f, f.name);
      const res = await fetch(`${API}/api/jobs`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Job failed");
      setJob(data.job);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  const progress = job?.progress ?? 0;
  const isRunning = job && !["done", "failed"].includes(job.status);
  const ticketClass =
    job?.status === "done" ? "done" : isRunning ? "running" : "";

  // Determine which architecture node is "active" based on job status
  const activeNodes = !job ? [] :
    job.status === "queued"  ? ["client", "api", "bus"] :
    job.status === "running" ? ["bus", "worker", "store", "cache"] :
    job.status === "done"    ? ["api", "db", "store"] :
    [];

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="top">
        <a className="logo" href="/">
          <div className="logo-mark">Anvil<span>.</span></div>
          <div className="logo-sub">PDF Forge</div>
        </a>
        <div className="meta-row">
          <span className="tag ok">No sign-up required</span>
          <span className="tag">Samples included</span>
          <span className="tag service-count">6 services</span>
          <span className="tag zerops">Zerops</span>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero">
        <div>
          <h1>
            <em>Six microservices</em> forge your PDFs in&nbsp;seconds.
          </h1>
          <p className="sub">
            Merge, split, compress, or convert images — processed through a distributed
            pipeline of Fastify, NATS, a dedicated worker, Valkey, Postgres, and S3.
          </p>
          <p className="sub-detail">
            No login. No install. Hit the button — watch data flow through
            the architecture below in real time.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="btn accent"
              disabled={busy}
              onClick={() => runDemo("merge", ["sample-report", "sample-brief"])}
            >
              ⚡ Run live pipeline demo
            </button>
            <a className="btn" href="#architecture">
              View architecture ↓
            </a>
          </div>
        </div>

        <div className={`ticket ${ticketClass}`}>
          <div className="ticket-head">
            <span>Job ticket</span>
            <span>{job?.id ? `#${job.id}` : "waiting"}</span>
          </div>
          <div className="ticket-body">
            {/* Stamp overlay for completed jobs */}
            {job?.status === "done" && (
              <div className="ticket-stamp">{job.tool === "merge" ? "Merged" : job.tool === "split" ? "Split" : job.tool === "compress" ? "Compressed" : "Forged"}</div>
            )}
            <p className="ticket-status">
              {!job && "Ready"}
              {job?.status === "queued" && "Queued — entering the fire"}
              {job?.status === "running" && "Forging…"}
              {job?.status === "done" && "Complete"}
              {job?.status === "failed" && "Failed"}
            </p>
            <p className="ticket-msg">{job?.message || "Pick a tool or hit the demo button to see the pipeline in action."}</p>
            <div className="meter" aria-hidden>
              <i style={{ width: `${job ? progress : 0}%` }} />
            </div>
            {job && (
              <div className="stats">
                <div>
                  Tool
                  <b>{TOOLS.find(t => t.id === job.tool)?.icon} {job.tool}</b>
                </div>
                <div>
                  Size
                  <b>
                    {bytes(job.input_bytes)}
                    {job.output_bytes != null ? ` → ${bytes(job.output_bytes)}` : ""}
                  </b>
                </div>
                {job.started_at && job.finished_at && (
                  <div>
                    Duration
                    <b>{elapsed(job.started_at, job.finished_at)}</b>
                  </div>
                )}
              </div>
            )}
            {job?.status === "done" && downloadUrl && (
              <a className="btn primary block" href={downloadUrl} target="_blank" rel="noreferrer">
                ↓ Download {job.output_name || "result.pdf"}
              </a>
            )}
            {job?.status === "failed" && (
              <div className="err">{job.error || job.message}</div>
            )}
          </div>
        </div>
      </section>

      {/* ── Architecture Diagram ── */}
      <section className="arch-section" id="architecture">
        <p className="section-label">How it works — Zerops multi-service architecture</p>
        <div className="arch-card">
          <h2>Every PDF job traverses 6 orchestrated services</h2>
          <p className="arch-sub">
            Upload hits the API. NATS queues the job. A dedicated worker processes the PDF
            with qpdf/Ghostscript. Progress streams through Valkey. Files stage in S3.
            Postgres persists the audit trail.
          </p>
          <div className="arch-flow">
            {ARCH.map((node, i) => (
              <span key={node.id} style={{ display: "contents" }}>
                <div className={`arch-node${activeNodes.includes(node.id) ? " active" : ""}`}>
                  <div className={`arch-icon ${node.cls}`}>
                    {node.icon}
                  </div>
                  <span className="arch-label">{node.name}</span>
                  <span className="arch-type">{node.type}</span>
                </div>
                {i < ARCH.length - 1 && <span className="arch-arrow">→</span>}
              </span>
            ))}
          </div>
          <div className="arch-legend">
            <div className="arch-legend-item"><span className="arch-legend-dot runtime" /> Runtime</div>
            <div className="arch-legend-item"><span className="arch-legend-dot infra" /> Infrastructure</div>
            <div className="arch-legend-item"><span className="arch-legend-dot data" /> Database</div>
            <div className="arch-legend-item"><span className="arch-legend-dot storage" /> Storage</div>
          </div>
        </div>
      </section>

      {/* ── Tool Selector ── */}
      <p className="section-label">Choose your tool</p>
      <div className="tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool ${tool === t.id ? "active" : ""}`}
            onClick={() => setTool(t.id)}
          >
            <span className="tool-icon">{t.icon}</span>
            <strong>{t.name}</strong>
            <span>{t.blurb}</span>
          </button>
        ))}
      </div>

      {/* ── Workbench ── */}
      <div className="bench">
        <div className="panel">
          <h2>Sample files</h2>
          <p className="hint">Built-in PDFs for instant demos — nothing to upload, zero friction.</p>
          <div className="sample-grid">
            {samples.map((s) => (
              <div className="sample" key={s.id}>
                <div>
                  <strong>{s.label || s.id}</strong>
                  <div className="sz">{bytes(s.bytes)}</div>
                </div>
                <a className="btn sm" href={`${API}/api/samples/${s.id}`} target="_blank" rel="noreferrer">
                  Preview
                </a>
              </div>
            ))}
            {!samples.length && <p className="hint">Loading samples…</p>}
          </div>
          <div className="demo-row">
            <button type="button" className="btn primary" disabled={busy} onClick={() => runDemo("merge", ["sample-report", "sample-brief"])}>
              Merge Report + Brief
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => runDemo("split", ["sample-brief"])}>
              Split Brief · pages 1–2
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => runDemo("compress", ["sample-report"])}>
              Compress Report
            </button>
          </div>
        </div>

        <div className="panel">
          <h2>Your files</h2>
          <p className="hint">Drag your own PDFs here — or just use the samples above for the full demo.</p>
          <form onSubmit={runUpload}>
            <div
              className={`drop${dragOver ? " drag-active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length) setFiles([...e.dataTransfer.files]);
              }}
            >
              <input
                type="file"
                multiple
                accept={tool === "imagespdf" ? "image/*" : "application/pdf"}
                onChange={(e) => setFiles([...e.target.files])}
              />
              <p>{dragOver ? "Drop to add files" : "Drop PDFs here, or click to choose"}</p>
              <p className="muted">
                {files.length ? `${files.length} file${files.length > 1 ? "s" : ""} · ${bytes(files.reduce((s, f) => s + f.size, 0))}` : "none selected"}
              </p>
            </div>
            {tool === "split" && (
              <div className="fields">
                <label>
                  From page
                  <input type="number" min={1} value={from} onChange={(e) => setFrom(Number(e.target.value))} />
                </label>
                <label>
                  To page
                  <input type="number" min={1} value={to} onChange={(e) => setTo(Number(e.target.value))} />
                </label>
              </div>
            )}
            {err && <div className="err">{err}</div>}
            <button className="btn primary block" type="submit" disabled={busy || !files.length}>
              {busy ? "Starting…" : `Run ${tool}`}
            </button>
          </form>
        </div>
      </div>

      {/* ── History ── */}
      <div className="history">
        <p className="section-label">Recent jobs</p>
        <div className="hist">
          {history.map((j, i) => (
            <button
              key={j.id}
              type="button"
              className="hist-row"
              style={{ animationDelay: `${i * .04}s` }}
              onClick={async () => {
                const d = await api(`/api/jobs/${j.id}`);
                setJob(d.job);
                setDownloadUrl(d.downloadUrl || null);
              }}
            >
              <span className={`badge ${j.status}`}>{j.status}</span>
              <span>{TOOLS.find(t => t.id === j.tool)?.icon} {j.tool}</span>
              <span className="hide-sm" style={{ color: "var(--mute)", fontFamily: "var(--mono)", fontSize: ".78rem" }}>
                {bytes(j.input_bytes)}
                {j.output_bytes != null ? ` → ${bytes(j.output_bytes)}` : ""}
                {j.started_at && j.finished_at ? ` · ${elapsed(j.started_at, j.finished_at)}` : ""}
              </span>
              <span className="hide-sm" style={{ fontFamily: "var(--mono)", fontSize: ".72rem", color: "var(--mute)" }}>
                #{j.id}
              </span>
            </button>
          ))}
          {!history.length && <p className="hint">No jobs yet — run a demo to see the pipeline in action.</p>}
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="foot">
        <div>
          <strong>Zerops multi-service architecture</strong>
          <div className="chips">
            <span className="chip">anvilapi · Fastify REST</span>
            <span className="chip">anvilworker · PDF processing</span>
            <span className="chip">anvildb · PostgreSQL</span>
            <span className="chip">anvilbus · NATS queue</span>
            <span className="chip">anvilcache · Valkey</span>
            <span className="chip">anvilstore · S3 objects</span>
          </div>
        </div>
        <a
          className="zerops-badge"
          href="https://zerops.io"
          target="_blank"
          rel="noreferrer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
          </svg>
          Built and deployed on Zerops
        </a>
        <p className="fine">
          No login required. No data stored beyond job completion. Not affiliated with anvil.works or useanvil.com.
          <br />
          Architecture: 2 runtimes · 1 database · 1 message bus · 1 cache · 1 object store — all orchestrated by Zerops.
        </p>
      </footer>
    </div>
  );
}
