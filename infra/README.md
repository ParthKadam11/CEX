# Local Infrastructure

`pnpm infra:up` starts Redis, PostgreSQL, and TimescaleDB for **local development**.

App processes are not in Compose. After infra is healthy:

```bash
pnpm setup:local
pnpm dev:stack
```

## Quick path

```bash
pnpm infra:up
pnpm setup:local   # writes .env files if missing + prisma migrate deploy
pnpm dev:stack     # exchange, gateway, OMS, ingester, web
```

Open http://localhost:3000. Fill `GOOGLE_*` and `NEXTAUTH_SECRET` in `apps/web/.env` to sign in.

## Services

### Redis

```env
REDIS_URL=redis://127.0.0.1:6379
```

Streams (OMS ↔ gateway) and pub/sub (live market fan-out).

### PostgreSQL

```env
DATABASE_URL=postgresql://postgres:mysecretpassword@127.0.0.1:5432/postgres
```

Users and OMS via Prisma. Trading balances live in the exchange **WAL** under `apps/exchange/data/` (not Postgres).

### TimescaleDB

```env
TIMESCALE_URL=postgresql://cex:cex@127.0.0.1:5434/cex_md
```

Ingester migrates on boot and serves history on `:4040`.

## Commands

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:logs
```

## Ports

| Service | Port | Purpose |
| --- | --- | --- |
| Redis | `6379` | Streams / pub/sub |
| PostgreSQL | `5432` | Users, OMS |
| TimescaleDB | `5434` | Market-data history |
| Prometheus | `9090` | Metrics scrape + UI (host network → `127.0.0.1`) |
| Grafana | `3001` | Dashboards (host network → `127.0.0.1`) |
| Loki | `3100` | Log store (host network → `127.0.0.1`) |

Compose binds data stores to `127.0.0.1`. Prometheus, Grafana, Loki, and Promtail use `network_mode: host` so they can reach each other and PM2 apps on loopback.

```bash
# After apps are up:
curl -s http://127.0.0.1:4020/metrics | head
# Prometheus: http://127.0.0.1:9090
# Grafana:    http://127.0.0.1:3001  (admin / cex-grafana-change-me)
# Loki ready: curl -s http://127.0.0.1:3100/ready
# Optional:   GRAFANA_ADMIN_PASSWORD=...  PM2_LOG_DIR=...
```

Provisioned dashboards (folder CEX):
- **CEX Operations** (home) — fleet overview + incident logs + collapsible per-service detail
- **CEX Engine Gateway** — deep gateway counters
- **CEX Services** — compact multi-service metrics
- **CEX PM2 Logs** — logs-only view

All of this runs **on your VPS** (Docker). There is no Grafana Cloud / Datadog bill — only Contabo disk/CPU for retention.

Promtail tails `$PM2_LOG_DIR` (default `/home/deployer/.pm2/logs`) into Loki (7-day retention).

## Requirements

- Docker Desktop (or compatible)
- Free local ports `6379`, `5432`, `5434`, `9090`, `3001`, `3100`

## What this stack does not start

Exchange, gateway, OMS, ingester, or Next.js — use `pnpm dev:stack` or `pnpm dev:backend`.

You do **not** need nginx, PM2, or certbot for local work.

## Deploy (optional)

When you want a public host: [`DEPLOY.md`](./DEPLOY.md) (single-host PM2 + nginx, or Vercel + Render). Sample proxy configs: [`nginx/`](./nginx/).
