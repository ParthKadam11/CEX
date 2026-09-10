# CEX

A multi-service paper centralized exchange built to study what actually happens after someone clicks Buy: matching, balance locks, durable order flow, market-data persistence, and perpetual risk.

It is a systems project: a single-writer matching engine, an asynchronous OMS with a transactional outbox, a gateway that translates Redis Streams and exchange SSE, and a separate TimescaleDB ingester. Spot and perpetual markets run in-process with mark price, liquidation, and funding.

Built to make failure modes visible duplicate commands, maker/taker fills, reconnect gaps, crash windows between engine execution and event publication instead of hiding them behind a single CRUD API.

## What makes it different

- Engine owns matching and balances; OMS is a durable projection, not a second matching engine
- Place/cancel flow uses Redis Streams + Postgres outbox instead of synchronous “write DB and hope”
- Maker and taker fills share a trade id but are stored per order; events carry engine sequence
- Live market data is ephemeral (pub/sub); history is durable (`md:events` → Timescale)
- Perps add margin, positions, mark, liquidation, and funding on top of the same engine model
- SSE reconnect uses `streamSeq` catch-up, with reconcile when the in-memory ring was overrun

## Repository Overview

- `apps/exchange`  
Single-writer matching engine. One process hosts spot `SOL-USD` and perpetual `SOL-USD-PERP` by default (USD margin, positions, mark, liquidation, funding).
- `apps/oms`  
Product-facing order state in Postgres, transactional command outbox, and event-driven status updates.
- `apps/engine-gateway`  
Sole client of the exchange: Redis commands → engine HTTP; SSE → `orders:events` + `md:events` + live pub/sub.
- `apps/ingester`  
Consumes durable market-data events into TimescaleDB and serves historical trades, BBO, and candles.
- `apps/web`  
Next.js trading app: Google auth, paper credit, Spot / Perps surfaces, charts, and BFF proxies.
- `packages/exchange-types`  
Shared engine domain types: orders, trades, balances, positions, events, commands.
- `packages/app-contracts`  
Application-layer Redis Streams / pub/sub contracts.
- `packages/db`  
Prisma schema for users and OMS order state.
- `infra`  
Local Redis, PostgreSQL, and TimescaleDB.



## Current Architecture

```text
apps/web
  └─ user auth + trading UX

apps/exchange
  └─ matching engine + balances + WAL + snapshots + HTTP/SSE

Application layer
  └─ OMS → engine-gateway → exchange
  └─ Redis Streams + Redis pub/sub
  └─ exchange SSE → engine-gateway → md:events + orders:events
  └─ md:events → ingester → TimescaleDB
```



### Exchange engine

The exchange engine is intentionally single-writer per market. It keeps matching logic in memory and uses disk only for crash recovery.

- `MarketRuntime` coordinates live commands, WAL persistence, replay, and checkpoints.
- `CommandQueue` serializes concurrent commands and batches WAL flushes.
- `FileWal` appends `CREDIT`, `PLACE`, `CANCEL`, `LIQUIDATE`, and `FUNDING` commands.
- Snapshots shorten restart time by restoring state and replaying only the WAL tail.
- `EventBus` publishes live `ORDER`, `BBO`, `CREDIT`, `TRADE`, `POSITION`, `LIQUIDATION`, and `FUNDING` events for SSE consumers.
- SSE includes a monotonic `streamSeq` and a bounded ring so reconnecting gateways can catch up via `?afterSeq=` / `Last-Event-ID` (gap signal when the ring was overrun).
- On SSE `gap`, the gateway calls `GET /v1/markets/:market/reconcile` and republishes retained order events, order snapshots, positions, liquidations, and funding to `orders:events` so OMS can catch up.



### Application layer direction

The application layer wraps the engine with service boundaries:

- Redis Streams for command/event delivery between OMS and the engine gateway
- Exchange SSE as the canonical source for BBO, trades, and maker-side fills
- Redis pub/sub for live best bid/ask and trade fan-out
- The durable `md:events` stream and TimescaleDB for historical market data
- The existing Postgres database for users, wallets, and OMS order state



## Monorepo Layout

```text
CEX/
├── apps/
│   ├── exchange/
│   ├── engine-gateway/
│   ├── ingester/
│   ├── oms/
│   └── web/
├── infra/
└── packages/
    ├── app-contracts/
    ├── db/
    ├── exchange-types/
    └── typescript-config/
```



## Prerequisites

- Node.js `>=20`
- pnpm `10.14.0` (enable with `corepack enable`)
- Docker Desktop (or compatible) for Redis / Postgres / Timescale

## Local quickstart

```bash
pnpm install
pnpm infra:up
pnpm setup:local          # creates .env files if missing + migrate deploy
```

Edit `apps/web/.env` and set:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET` (any random string locally)
- `NEXTAUTH_URL=http://localhost:3000`

Then start the full stack (exchange, gateway, OMS, ingester, web):

```bash
pnpm dev:stack
```

Open [http://localhost:3000](http://localhost:3000).

| Command | What it starts |
| --- | --- |
| `pnpm infra:up` | Redis `:6379`, Postgres `:5432`, Timescale `:5434` |
| `pnpm setup:local` | Env templates + `prisma migrate deploy` |
| `pnpm dev:stack` | All app processes (labeled logs) |
| `pnpm dev:backend` | Same without Next.js |
| `pnpm dev` | Web only |

Default local tokens and URLs live in [`.env.example`](.env.example). `setup:local` copies them to root `.env`, `packages/db/.env`, and `apps/web/.env` when those files are missing (never overwrites).

Backend services load env from cwd / repo root / `packages/db/.env`. Next.js only reads `apps/web/.env`.

Sign-in still uses Google (Gmail). Auth is unchanged for this local pass.

### Ports

| Service | Port |
| --- | --- |
| Web | `3000` |
| Exchange | `4010` |
| Engine gateway | `4020` |
| OMS | `4030` |
| Ingester (history) | `4040` |
| Redis | `6379` |
| Postgres | `5432` |
| Timescale | `5434` |

### Individual services

```bash
pnpm dev:exchange
pnpm dev:gateway
pnpm dev:oms
pnpm dev:ingester
pnpm dev
```

Exchange hosts both `SOL-USD` and `SOL-USD-PERP` on `:4010` by default. WALs live under `apps/exchange/data/<market>.jsonl`.

```bash
# Spot only
cross-env EXCHANGE_MARKET=SOL-USD pnpm dev:exchange

# Legacy separate perp process on :4011
pnpm dev:exchange:perp
```

Supported engine environment variables:

- `EXCHANGE_MARKETS` — comma list, default `SOL-USD,SOL-USD-PERP`
- `EXCHANGE_MARKET` — single-market override
- `EXCHANGE_PORT` — HTTP/SSE port (default `4010`)
- `EXCHANGE_WAL_PATH` — only when hosting a single market
- `EXCHANGE_DATA_DIR` — WAL directory (default `apps/exchange/data`)

### Database migrations

```bash
pnpm db:migrate:deploy   # apply existing migrations (CI / local setup)
pnpm db:migrate          # prisma migrate dev (schema authors)
pnpm db:generate
```

### Infra only

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:logs
```

See [`infra/README.md`](infra/README.md) for local Compose.  
See [`infra/DEPLOY.md`](infra/DEPLOY.md) for Render + Vercel + Neon + TigerCloud production deploy (`render.yaml`).

### Tokens for non-local deployments

Set matching tokens across services: `OMS_INTERNAL_TOKEN`, `GATEWAY_INTERNAL_TOKEN` / `ENGINE_GATEWAY_INTERNAL_TOKEN`, `EXCHANGE_GATEWAY_TOKEN`, `INGESTER_INTERNAL_TOKEN` / `MARKET_DATA_INTERNAL_TOKEN`. Point `MARKET_DATA_URL` at the ingester.

See [API.md](API.md) for request IDs, error envelopes, order pagination, and BFF/internal boundaries.

## Exchange API

One exchange process hosts both markets (`SOL-USD` and `SOL-USD-PERP`) by default. Command, balance, book, and stream APIs require `x-gateway-token`. Only `/health` is public.


| Method   | Path                                           | Purpose                                              |
| -------- | ---------------------------------------------- | ---------------------------------------------------- |
| `GET`    | `/health`                                      | Process health and active markets                    |
| `POST`   | `/v1/markets/:market/credit`                   | Internal gateway credit operation                    |
| `POST`   | `/v1/markets/:market/orders`                   | Place a limit or market order (`leverage` for perps) |
| `DELETE` | `/v1/markets/:market/orders/:orderId`          | Cancel an order                                      |
| `GET`    | `/v1/markets/:market/orders/:orderId`          | Fetch one order                                      |
| `GET`    | `/v1/markets/:market/orders?userId=&openOnly=` | Fetch user orders                                    |
| `GET`    | `/v1/markets/:market/balances/:userId`         | Fetch engine balances                                |
| `GET`    | `/v1/markets/:market/positions`                | List positions with risk fields (perp)               |
| `GET`    | `/v1/markets/:market/positions/:userId`        | Fetch one user position                              |
| `GET`    | `/v1/markets/:market/mark`                     | Mark price (BBO mid or last trade)                   |
| `GET`    | `/v1/markets/:market/funding`                  | Funding rate / interval (perp)                       |
| `POST`   | `/v1/markets/:market/funding/settle`           | Force a funding settle tick (perp)                   |
| `GET`    | `/v1/markets/:market/book`                     | Fetch order book snapshot                            |
| `GET`    | `/v1/markets/:market/reconcile`                | Gap recovery snapshot (orders, events, risk)         |
| `GET`    | `/v1/markets/:market/stream?userId=`           | Subscribe to live SSE                                |


Notable engine rules:

- Units are integer-only.
- Spot market buys require `quoteBudget`; perp MARKET orders require `quoteBudget` on both sides (notional cap for margin).
- Perps lock USD margin (`ceil(notional / leverage)`); fills update positions and realize PnL — no SOL delivery.
- Maintenance liquidation force-closes underwater perps at mark vs house (`sim-liquidator`).
- Funding settles periodically (demo: 100 bps / 60s); longs pay shorts when rate > 0.
- Credit balances per market separately (spot USD and perp USD are not shared).
- Exchange place/credit are idempotent on retry: same `orderId`+intent returns the prior order; credit with `commandId` does not double-apply.
- Gateway command handling journals the outcome in Redis before publish, then marks processed — crash mid-flight retries replay the outcome (deterministic event ids) instead of relying on a best-effort mark.
- `FOK_BUDGET` is a market-buy-only fill-or-kill order. It must fill the
requested quantity within `quoteBudget` or reject before matching.
- The exchange `BalanceStore` and its WAL are authoritative for trading balances.



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



### OMS test suite

```bash
pnpm test:oms
pnpm test:oms:integration
```

The integration test requires PostgreSQL, Redis, the exchange, the engine gateway, and OMS to be running.

### Implemented

- Spot exchange engine for `SOL-USD` and perp engine for `SOL-USD-PERP` (one multi-market process by default)
- Spot balance locking / delivery settlement; perp USD margin + positions + PnL
- Mark price, maintenance liquidation (force-close at mark), and periodic funding payments
- WAL persistence with checkpoints and replay (`CREDIT` / `PLACE` / `CANCEL` / `LIQUIDATE` / `FUNDING`; positions in snapshot v2)
- HTTP commands and queries (orders, balances, book, mark, positions + risk fields, funding)
- SSE for live order, credit, BBO, trade, position, liquidation, and funding events
- Engine gateway multi-market routing; Redis fan-out for POSITION / LIQUIDATION / FUNDING
- OMS order APIs with perp leverage persistence + idempotency, Postgres order state, outbox, event-driven status updates
- OMS cancel uses a conditional status update (`PENDING`/`ACCEPTED`/`OPEN`/`PARTIALLY_FILLED` only) so a fill race cannot mark a terminal order `CANCEL_REQUESTED`
- Market-data writer (TimescaleDB history for trades, BBO, and one-minute candles per market)
- Web app authentication, paper credit, and Spot / Perps trading surfaces (functional; design polish deferred)
- Application-layer infra bootstrap and shared message contracts

