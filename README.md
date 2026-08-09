# Anvil · PDF Forge

**Six microservices forge your PDFs in seconds.**

Merge · Split · Compress · Images → PDF  
Built for [The Zerops Challenge](https://www.wemakedevs.org/hackathons/zerops).

> Not affiliated with [anvil.works](https://anvil.works) or [useanvil.com](https://www.useanvil.com).

## Live demo

**https://anvilapi-2e7c-3000.prg1.zerops.app**

No login. Sample PDFs included. Results download when ready.

## How Zerops is used

| Service | Role |
|---------|------|
| `anvilapi` | React UI + Fastify API (enqueue only) |
| `anvilworker` | PDF processing (`qpdf`, Ghostscript, `img2pdf`) |
| `anvildb` | PostgreSQL — jobs audit trail |
| `anvilbus` | NATS — job queue |
| `anvilcache` | Valkey — live progress |
| `anvilstore` | Object storage — uploads & results |

```text
Browser → anvilapi → NATS → anvilworker → S3
                ↘ Postgres   ↗ Valkey progress
```

## Stack

- npm workspaces: `apps/api`, `apps/web`, `apps/worker`
- API: Fastify, multipart uploads, signed download URLs
- Worker: claim jobs via NATS queue group, process with system PDF tools
- Web: React 19 + Vite (baked into `anvilapi` public/)

## Local development

```bash
# Postgres, NATS, Redis/Valkey, S3-compatible storage required
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/anvil
export NATS_HOST=127.0.0.1 NATS_PORT=4222
export REDIS_URL=redis://127.0.0.1:6379
export S3_ENDPOINT=... S3_BUCKET=... S3_KEY=... S3_SECRET=... S3_REGION=us-east-1

npm install
npm run dev:api      # :3000
npm run dev:worker
npm run dev:web      # :5173 proxies /api
```

## Deploy on Zerops

```bash
# import services from your project, then:
zcli push --setup anvilapi
zcli push --setup anvilworker
# optional UI proxy host:
zcli push --setup anvilweb
```

See `zerops.yaml` for build/run config and cross-service env wiring.

## AI disclosure

Built with AI coding agents (Grok Build / ZCP) under human direction for architecture, product, and review.

## License

MIT
