# CEX

A multi-service **paper** centralized exchange built to study what actually happens after someone clicks Buy: matching, balance locks, durable order flow, market-data persistence, and perpetual risk.

It is a systems project: a single-writer matching engine, an asynchronous OMS with a transactional outbox, a gateway that translates Redis Streams and exchange SSE, and a separate TimescaleDB ingester. Spot and perpetual markets run in-process with mark price, liquidation, and funding.

Built to make failure modes visible — duplicate commands, maker/taker fills, reconnect gaps, crash windows between engine execution and event publication — instead of hiding them behind a single CRUD API.

## Live demo

| | URL |
| --- | --- |
| Trading UI | https://papertrade.parthkadam.tech |
| Gateway SSE | https://papertrade-gw.parthkadam.tech |

Hosted on a Contabo VPS: Docker Compose for Redis/Postgres/Timescale, PM2 for Node apps, nginx + Let’s Encrypt for HTTPS. Google sign-in required.

## What makes it different

- Engine owns matching and balances; OMS is a durable projection, not a second matching engine
- Place/cancel flow uses Redis Streams + Postgres outbox instead of synchronous “write DB and hope”
- Maker and taker fills share a trade id but are stored per order; events carry engine sequence
- Live market data is ephemeral (pub/sub); history is durable (`md:events` → Timescale)
- Perps add margin, positions, mark, liquidation, and funding on top of the same engine model
- SSE reconnect uses `streamSeq` catch-up, with reconcile when the in-memory ring was overrun
- Production browsers EventSource the gateway **directly** (stream ticket from the web BFF)

## Repository overview

| Path | Role |
| --- | --- |
| `apps/exchange` | Matching engine + balances + WAL (spot `SOL-USD` + perp `SOL-USD-PERP`) |
| `apps/oms` | Postgres order state, outbox, status projection |
| `apps/engine-gateway` | Redis commands → exchange; public SSE + internal APIs |
| `apps/ingester` | `md:events` → Timescale; history HTTP API |
| `apps/web` | Next.js UI + auth BFF ([details](apps/web/README.md)) |
| `packages/*` | Shared types, contracts, Prisma, TS config |
| `infra/` | Docker Compose, nginx site configs |
| `ecosystem.config.cjs` | PM2 process file (VPS) |
| `.github/workflows/` | CI (lint/typecheck/unit) + Deploy (SSH to VPS) |

## Architecture

```text
Browser ──HTTPS──► nginx
                     ├─ papertrade…      → web :3000 (loopback)
                     └─ papertrade-gw…   → gateway :4020 (loopback, SSE)

apps/web (BFF)
  ├─ OMS_URL            → oms :4030
  ├─ ENGINE_GATEWAY_URL → gateway :4020
  └─ MARKET_DATA_URL    → ingester :4040

OMS ──Redis streams──► gateway ──HTTP──► exchange :4010
gateway ◄──SSE── exchange
gateway ──md:events / orders:events──► Redis
ingester ◄──md:events── Redis ──► TimescaleDB
```

Internal app ports and Compose DB ports bind to **127.0.0.1**. Only SSH + nginx (80/443) are public.

### Exchange engine

Single-writer per market; matching in memory; disk for crash recovery.

- `MarketRuntime` — commands, WAL, replay, checkpoints
- `FileWal` — `CREDIT` / `PLACE` / `CANCEL` / `LIQUIDATE` / `FUNDING`
- SSE with monotonic `streamSeq` + ring buffer (`?afterSeq=` / `Last-Event-ID`)
- On SSE `gap`, gateway reconciles and republishes to `orders:events` for OMS catch-up

### Application layer

- Redis Streams between OMS and gateway
- Exchange SSE as source for BBO, trades, maker fills
- Redis pub/sub for live book/trade fan-out
- Timescale for history; Postgres for users + OMS

## Monorepo layout

```text
CEX/
├── apps/           # exchange, engine-gateway, ingester, oms, web
├── packages/       # app-contracts, db, exchange-types, logger, typescript-config
├── infra/          # docker-compose.yml, nginx/
├── .github/workflows/
├── ecosystem.config.cjs
└── package.json
```

## Prerequisites

- Node.js `20.x`
- pnpm `10.14.0`
- Docker (Redis / Postgres / Timescale)

## Local quickstart

```bash
pnpm install
pnpm infra:up
pnpm setup:local          # creates .env files if missing + migrate deploy
```

Edit `apps/web/.env`:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL=http://localhost:3000`

```bash
pnpm dev:stack
```

Open [http://localhost:3000](http://localhost:3000).

| Command | What it does |
| --- | --- |
| `pnpm infra:up` | Redis `:6379`, Postgres `:5432`, Timescale `:5434` |
| `pnpm setup:local` | Env templates + `prisma migrate deploy` |
| `pnpm dev:stack` | All app processes |
| `pnpm dev:backend` | Without Next.js |
| `pnpm test:ci` | Unit tests used in GitHub Actions |
| `pnpm typecheck` | Backend `tsc --noEmit` |
| `pnpm build:web` | Prisma generate + Next production build |
| `pnpm pm2:start` / `pm2:reload` | VPS process management |

Defaults: [`.env.example`](.env.example). `setup:local` never overwrites existing env files. Backends load root `.env`; Next.js only reads `apps/web/.env`.

### Ports (local / loopback on VPS)

| Service | Port |
| --- | --- |
| Web | `3000` |
| Exchange | `4010` |
| Engine gateway | `4020` |
| OMS | `4030` |
| Ingester | `4040` |
| Redis | `6379` |
| Postgres | `5432` |
| Timescale | `5434` |

### Production (this VPS)

```bash
pnpm infra:up
# configure root .env + apps/web/.env (HTTPS URLs, random internal tokens, Google OAuth)
pnpm build:web
pnpm pm2:start
pm2 save && pm2 startup
```

nginx terminates TLS and proxies to loopback (see `infra/nginx/`).  
CI: push/PR → `.github/workflows/ci.yml`.  
Deploy: green CI on `main` (or manual) → `.github/workflows/deploy.yml` SSHs in, pulls, builds, `pm2 reload`.

Required matching tokens: `OMS_INTERNAL_TOKEN`, `GATEWAY_INTERNAL_TOKEN` / `ENGINE_GATEWAY_INTERNAL_TOKEN`, `EXCHANGE_GATEWAY_TOKEN`, `INGESTER_INTERNAL_TOKEN` / `MARKET_DATA_INTERNAL_TOKEN`. Set `ENGINE_GATEWAY_PUBLIC_URL` and `CORS_ORIGINS` to the public HTTPS origins.

Alternate cloud layout (Vercel + Render): [`infra/DEPLOY.md`](infra/DEPLOY.md).

API details: [API.md](API.md).

## Exchange API (summary)

Commands require `x-gateway-token`. Health is public.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process health |
| `POST` | `/v1/markets/:market/credit` | Paper credit |
| `POST` | `/v1/markets/:market/orders` | Place order |
| `DELETE` | `/v1/markets/:market/orders/:orderId` | Cancel |
| `GET` | `/v1/markets/:market/book` | Book snapshot |
| `GET` | `/v1/markets/:market/stream` | Live SSE |
| `GET` | `/v1/markets/:market/reconcile` | Gap recovery |

Integer units only. Spot MARKET buys need `quoteBudget`. Perps use USD margin, mark, liquidation, and funding. WAL under `EXCHANGE_DATA_DIR` is authoritative for balances.

## Testing

```bash
pnpm test:ci                 # unit suites (CI)
pnpm test:exchange:unit
pnpm test:oms
pnpm test:gateway:unit
pnpm test:ingester
pnpm test:exchange:integration   # needs infra
pnpm test:oms:integration        # needs full stack
```

## Implemented

- Spot + perp engines in one process (`SOL-USD`, `SOL-USD-PERP`)
- WAL + snapshots; mark, liquidation, funding
- Gateway multi-market routing + direct browser SSE (ticketed)
- OMS outbox / event-driven status; Timescale history
- Web: Google auth, paper credit, Spot / Perps desks
- Contabo deploy: Compose + PM2 + nginx + GitHub Actions
