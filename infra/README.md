# Local Infrastructure

`pnpm infra:up` starts Redis, PostgreSQL, and TimescaleDB for local development.

Application processes (exchange, gateway, OMS, ingester, web) are **not** in Compose — start them with `pnpm dev:stack` from the repo root after infra is healthy.

## Quick path

```bash
pnpm infra:up
pnpm setup:local
pnpm dev:stack
```

## Services

### Redis

- Streams: command/event delivery between OMS and the engine gateway
- Pub/sub: live market-data fan-out

```env
REDIS_URL=redis://127.0.0.1:6379
```

### PostgreSQL

Users and OMS order state via Prisma (`@cex/db`).

```env
DATABASE_URL=postgresql://postgres:mysecretpassword@127.0.0.1:5432/postgres
```

`pnpm setup:local` writes this into `packages/db/.env` and `apps/web/.env` when missing. Trading balances live in the exchange **WAL** on disk (not Postgres). Locally that is `apps/exchange/data/`. On a host like Render, mount a persistent disk and set `EXCHANGE_DATA_DIR` to that mount — otherwise a restart looks like a wiped exchange even though WAL is working.

### TimescaleDB

Ingester history: BBO snapshots, trade ticks, candle aggregates.

```env
TIMESCALE_URL=postgresql://cex:cex@127.0.0.1:5434/cex_md
```

Ingester migrates its own schema on boot and serves history on `:4040`.

## Commands

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:logs
```

## Ports

| Service | Host port | Purpose |
| --- | --- | --- |
| Redis | `6379` | Streams and pub/sub |
| PostgreSQL | `5432` | Users, OMS orders |
| TimescaleDB | `5434` | Market-data history |

## Requirements

- Docker Desktop or a Docker-compatible engine
- Free ports `6379`, `5432`, and `5434`

## What this stack does not start

- Next.js (`apps/web`)
- Exchange engine
- Engine gateway, OMS, or ingester

Use `pnpm dev:stack` (or `pnpm dev:backend`) for those.

## Production

Deploy backends with the root [`render.yaml`](../render.yaml) blueprint. Full steps (Neon, TigerCloud, Vercel env, WAL disk, ports): [`DEPLOY.md`](./DEPLOY.md).
