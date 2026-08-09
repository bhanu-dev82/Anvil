# Anvil · PDF Forge

**Six microservices forge your PDFs in seconds.**

Merge · Split · Compress · Images → PDF — async on real infrastructure, not a single-container toy.

Built for **[The Zerops Challenge](https://www.wemakedevs.org/hackathons/zerops)** (WeMakeDevs × Zerops).

> Not affiliated with [anvil.works](https://anvil.works) or [useanvil.com](https://www.useanvil.com).

[![Zerops](https://img.shields.io/badge/Zerops-6%20services-0ea5e9)](https://zerops.io)
[![Demo](https://img.shields.io/badge/demo-no%20login-3dffa8)](https://anvilapi-2e7c-3000.prg1.zerops.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Live demo

**https://anvilapi-2e7c-3000.prg1.zerops.app**

No login. Sample files included. Results download when ready.

![Anvil PDF Forge live UI](docs/screenshot.png)

1. Open the live URL  
2. Click **Run live pipeline demo** (or pick Merge / Compress / Images → PDF)  
3. Watch the job ticket + architecture nodes update  
4. Download the forged PDF  

Health: https://anvilapi-2e7c-3000.prg1.zerops.app/api/health

---

## Why Anvil

PDF tools usually hide work in one process. Anvil makes the **platform story visible**:

- API **only enqueues** — no heavy PDF work on the request path  
- **Worker** runs `qpdf`, Ghostscript, `img2pdf`  
- **NATS** carries jobs  
- **Valkey** streams progress  
- **Postgres** is the audit trail  
- **Object storage** holds uploads and results  

That is the Zerops multi-service model: private network env refs, real managed services, deploy + verify.

---

## How Zerops is used

| Hostname | Type | Role |
|----------|------|------|
| `anvilapi` | Node.js 22 | React UI + Fastify REST (enqueue, samples, signed downloads) |
| `anvilworker` | Node.js 22 | PDF pipeline (merge / split / compress / images→PDF) |
| `anvildb` | PostgreSQL 16 | Jobs table — source of truth |
| `anvilbus` | NATS | Job queue (`anvil.jobs`) |
| `anvilcache` | Valkey | Live progress for the UI |
| `anvilstore` | Object storage | Uploads + result objects |
| `anvilweb` | Node.js 22 | Optional reverse-proxy UI host |

```text
Browser → anvilapi ──enqueue──► NATS ──► anvilworker ──► object storage
                │                  │           │
                └──── Postgres ◄───┴── Valkey progress ─┘
```

Env wiring (examples):

```yaml
DATABASE_URL: postgresql://${anvildb_user}:${anvildb_password}@${anvildb_hostname}:${anvildb_port}/${anvildb_dbName}
NATS_HOST: ${anvilbus_hostname}
REDIS_URL: ${anvilcache_connectionString}
S3_ENDPOINT: ${anvilstore_apiUrl}
S3_BUCKET: ${anvilstore_bucketName}
```

---

## Tools

| Tool | What it does |
|------|----------------|
| **Merge** | Combine multiple PDFs (`qpdf`) |
| **Split** | Extract a page range |
| **Compress** | Shrink with Ghostscript (+ `qpdf` fallback) |
| **Images → PDF** | Stack PNG/JPEG/WebP into one PDF (`img2pdf`) |

Demos use built-in samples: report, brief, photo — no upload required for judges.

---

## Stack

- **npm workspaces:** `apps/api`, `apps/web`, `apps/worker`
- **API:** Fastify, multipart, NATS publish, Postgres, Valkey, S3
- **Worker:** NATS queue group, system PDF tools on Ubuntu
- **Web:** React 19 + Vite (baked into `anvilapi` public for one public host)

---

## Local development

```bash
# Needs Postgres, NATS, Valkey/Redis, S3-compatible storage
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/anvil
export NATS_HOST=127.0.0.1 NATS_PORT=4222
export REDIS_URL=redis://127.0.0.1:6379
export S3_ENDPOINT=... S3_BUCKET=... S3_KEY=... S3_SECRET=... S3_REGION=us-east-1

npm install
npm run dev:api      # :3000
npm run dev:worker
npm run dev:web      # :5173 proxies /api
```

---

## Deploy on Zerops

```bash
npm i -g @zerops/zcli
zcli login <token>
# create services (see zerops-project-import.yml), then:
zcli push --setup anvilapi
zcli push --setup anvilworker
# optional:
zcli push --setup anvilweb
```

See `zerops.yaml` for build/run and cross-service env wiring.  
Demo script: [`docs/DEMO.md`](docs/DEMO.md).

---

## Repo layout

```text
anvil-pdf-forge/
  apps/
    api/       Fastify + SPA + samples + job enqueue
    web/       React UI (architecture live view)
    worker/    NATS consumer + qpdf/gs/img2pdf
  docs/        DEMO.md, screenshot.png
  zerops.yaml
  zerops-project-import.yml
```

---

## AI disclosure

Built with **Grok Build** (including **Zerops ZCP** / Browser VS Code) under human direction for product, architecture, demo, and submission.

Local `zcli` was used for project wiring; finishing and iterating on live infra happened fastest **inside ZCP**.

---

## License

MIT
