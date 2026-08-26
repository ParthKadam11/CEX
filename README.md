# CEX

CEX is a TypeScript monorepo for a centralized exchange prototype. The repository currently contains a working exchange engine and a custodial Solana web application, with the application layer being built around them.

## Repository Overview

- `apps/exchange`  
  A single-market exchange process for `SOL-USD`. It maintains the order book, validates units, matches orders, locks and settles balances, writes a durable command WAL, checkpoints snapshots, and exposes an HTTP + SSE API.

- `apps/web`  
  A Next.js application with Google sign-in, custodial Solana wallets, simulated USD balances, deposit and withdraw flows, and a dashboard for wallet state and recent activity.

- `packages/exchange-types`  
  Shared engine domain types such as orders, trades, balances, events, and engine commands.

- `packages/db`  
  Prisma client and schema for user accounts and wallet data.

- `packages/solana`  
  Shared Solana RPC helpers used by the web app.

- `packages/app-contracts`  
  Application-layer message contracts for Redis Streams, Redis pub/sub, and market-data payloads.

- `infra`  
  Local infrastructure for the application layer, currently Redis and TimescaleDB.

## Current Architecture

```text
apps/web
  └─ user auth + custodial wallet UX

apps/exchange
  └─ matching engine + balances + WAL + snapshots + HTTP/SSE

application layer (in progress)
  └─ Redis Streams + Redis pub/sub + TimescaleDB
```

### Exchange engine

The exchange engine is intentionally single-writer per market. It keeps matching logic in memory and uses disk only for crash recovery.

- `MarketRuntime` coordinates live commands, WAL persistence, replay, and checkpoints.
- `CommandQueue` serializes concurrent commands and batches WAL flushes.
- `FileWal` appends `CREDIT`, `PLACE`, and `CANCEL` commands.
- Snapshots shorten restart time by restoring state and replaying only the WAL tail.
- `EventBus` publishes live `ORDER`, `BBO`, and `CREDIT` events for SSE consumers.

### Application layer direction

The next layer does not reimplement matching. It wraps the engine with service boundaries:

- Redis Streams for command/event delivery between OMS and the exchange gateway
- Redis pub/sub for live best bid/ask and trade fan-out
- TimescaleDB for market-data history and candles
- The existing Postgres database for users now, and product-facing order tables later

## Monorepo Layout

```text
CEX/
├── apps/
│   ├── exchange/
│   └── web/
├── infra/
└── packages/
    ├── app-contracts/
    ├── db/
    ├── exchange-types/
    ├── solana/
    └── typescript-config/
```

## Prerequisites

- Node.js `>=20`
- pnpm `10.14.0`
- PostgreSQL for the Prisma-backed app database
- Docker Desktop or another Docker-compatible runtime for local infra

Enable Corepack if needed:

```bash
corepack enable
```

## Installation

```bash
pnpm install
```

## Environment

The web app expects its environment in `apps/web/.env`.

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

DATABASE_URL=postgresql://user:pass@localhost:5432/cex

NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

Generate the Prisma client and run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

## Running the project

### Web app

```bash
pnpm dev
```

Runs the Next.js app at `http://localhost:3000`.

### Exchange engine

```bash
pnpm --filter @cex/exchange dev
```

Runs the exchange service at `http://localhost:4010`.

Supported engine environment variables:

- `EXCHANGE_PORT`  
  Port for the HTTP/SSE server. Defaults to `4010`.
- `EXCHANGE_WAL_PATH`  
  Path to the market WAL file. Defaults to `apps/exchange/data/SOL-USD.jsonl` relative to the package working directory.

### Application-layer infra

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:logs
```

See `infra/README.md` for service details.

## Exchange API

The exchange currently exposes one market, `SOL-USD`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Process health and active market |
| `POST` | `/v1/markets/:market/credit` | Credit available balance |
| `POST` | `/v1/markets/:market/orders` | Place a limit or market order |
| `DELETE` | `/v1/markets/:market/orders/:orderId` | Cancel an order |
| `GET` | `/v1/markets/:market/orders/:orderId` | Fetch one order |
| `GET` | `/v1/markets/:market/orders?userId=&openOnly=` | Fetch user orders |
| `GET` | `/v1/markets/:market/balances/:userId` | Fetch engine balances |
| `GET` | `/v1/markets/:market/book` | Fetch order book snapshot |
| `GET` | `/v1/markets/:market/stream?userId=` | Subscribe to live SSE |

Notable engine rules:

- Units are integer-only.
- Market buys require `quoteBudget`.
- `FOK_BUDGET` is defined in types but not implemented by the engine.

## Testing

### Exchange test suite

```bash
pnpm test:exchange
pnpm test:exchange:unit
pnpm test:exchange:integration
pnpm test:exchange:e2e
```

- Unit tests cover core engine modules.
- Integration tests cover replay and durability behavior.
- End-to-end tests cover the HTTP surface and restart behavior.

## Project status

### Implemented

- Single-market exchange engine for `SOL-USD`
- Balance locking, settlement, and append-only ledger
- WAL persistence with checkpoints and replay
- HTTP commands and queries
- SSE for live order, credit, and BBO events
- Web app authentication, custodial wallet setup, deposit, withdraw, and dashboard UX
- Application-layer infra bootstrap and shared message contracts

### In progress

- Exchange gateway service
- OMS and product-side order history
- Price service and chart history
- Authenticated application gateway for trading flows

## Deployment notes

- `apps/web` is suitable for Vercel.
- `apps/exchange` should run as a single long-lived service with persistent disk for WAL and snapshots.
- Redis and TimescaleDB should be managed separately from the exchange process.
