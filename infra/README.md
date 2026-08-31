# Local Infrastructure

This directory contains the local infrastructure used by the application layer.

## Services

### Redis

Redis is used for two separate responsibilities:

- **Redis Streams**  
  Durable-ish command and event delivery between future application-layer services such as OMS and the exchange gateway.

- **Redis pub/sub**  
  Low-latency fan-out for live market data such as best bid/ask and recent trades.

Default connection string:

```env
REDIS_URL=redis://127.0.0.1:6379
```

### TimescaleDB

Enabled in `docker-compose.yml`; `pnpm infra:up` starts Redis and TimescaleDB.

The market-data writer uses this database for:

- BBO snapshots
- trade ticks
- later, candle aggregates built from those ticks

Default connection string:

```env
TIMESCALE_URL=postgresql://cex:cex@127.0.0.1:5434/cex_md
```

Start the separate writer after infrastructure is running:

```bash
pnpm dev:market-data
```

It owns the TimescaleDB schema and consumes the durable `md:events` Redis
stream. Its history API listens on port `4040` by default.

### PostgreSQL for users and orders

This stack does **not** start another PostgreSQL container for user data. The repository already uses Prisma and `DATABASE_URL` for user and wallet records through `@cex/db`.

The OMS uses that same database for product order state. Set `DATABASE_URL` in `packages/db/.env` before starting it; the OMS loads that file automatically when the variable is not already present. The exchange engine's WAL-backed balance ledger is authoritative for trading balances; Postgres `UsdWallet` is not used for order execution.

## Commands

From the repository root:

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:logs
```

## Ports

| Service | Host port | Purpose |
| --- | --- | --- |
| Redis | `6379` | Streams and pub/sub |
| TimescaleDB | `5434` | Market-data history |

## Requirements

- Docker Desktop or a Docker-compatible engine
- Available ports `6379` and `5434`

## What this stack does not start

- the Next.js web application
- the exchange engine
- OMS, exchange gateway, price service, or API gateway

Those services are started separately as they are implemented.
