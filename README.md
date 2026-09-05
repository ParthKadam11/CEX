# CEX

CEX is a TypeScript monorepo for a centralized exchange prototype. The repository currently contains a working exchange engine and a Next.js trading web app, with the application layer being built around them.

## Repository Overview

- `apps/exchange`  
Single-writer matching engine process (one market per process). Supports spot `SOL-USD` and perpetual `SOL-USD-PERP` (USD margin + positions).
- `apps/web`  
A Next.js application with Google sign-in, paper trading balances, and a dashboard for engine balances, orders, and the SOL-USD market.
- `apps/market-data-writer`  
A separate Redis consumer that persists durable BBO and trade events into TimescaleDB and serves historical market-data queries.
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
  └─ user auth + trading UX

apps/exchange
  └─ matching engine + balances + WAL + snapshots + HTTP/SSE

Application layer
  └─ OMS → engine-gateway → exchange
  └─ Redis Streams + Redis pub/sub
  └─ exchange SSE → engine-gateway → md:events + orders:events
  └─ md:events → market-data-writer → TimescaleDB
```



### Exchange engine

The exchange engine is intentionally single-writer per market. It keeps matching logic in memory and uses disk only for crash recovery.

- `MarketRuntime` coordinates live commands, WAL persistence, replay, and checkpoints.
- `CommandQueue` serializes concurrent commands and batches WAL flushes.
- `FileWal` appends `CREDIT`, `PLACE`, and `CANCEL` commands.
- Snapshots shorten restart time by restoring state and replaying only the WAL tail.
- `EventBus` publishes live `ORDER`, `BBO`, and `CREDIT` events for SSE consumers.



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
│   ├── market-data-writer/
│   ├── oms/
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

Optional web sim ambience (defaults on for long-running Node):

```env
# Set false to disable the server-side market-maker heartbeat
SIM_HEARTBEAT=true
```

The web app expects its environment in `apps/web/.env`.

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

DATABASE_URL=postgresql://postgres:mysecretpassword@localhost:5432/postgres
OMS_URL=http://127.0.0.1:4030
ENGINE_GATEWAY_URL=http://127.0.0.1:4020
# Optional shared-service tokens for non-local deployments.
OMS_INTERNAL_TOKEN=...
ENGINE_GATEWAY_INTERNAL_TOKEN=...
GATEWAY_INTERNAL_TOKEN=...
EXCHANGE_GATEWAY_TOKEN=...

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
pnpm dev:exchange
```

Runs **one** exchange process on `http://localhost:4010` hosting both `SOL-USD` (spot) and `SOL-USD-PERP` (perps). Each market still has its own WAL under `apps/exchange/data/<market>.jsonl`.

Optional single-market / split-process overrides:

```bash
# Spot only
cross-env EXCHANGE_MARKET=SOL-USD pnpm dev:exchange

# Legacy separate perp process on :4011 (optional)
pnpm dev:exchange:perp
```

Supported engine environment variables:

- `EXCHANGE_MARKETS`  
Comma list, default `SOL-USD,SOL-USD-PERP`.
- `EXCHANGE_MARKET`  
Single-market override (skips the default pair).
- `EXCHANGE_PORT`  
HTTP/SSE port. Defaults to `4010`.
- `EXCHANGE_WAL_PATH`  
Only when hosting a single market. Otherwise WALs are `data/<market>.jsonl`.
- `EXCHANGE_DATA_DIR`  
Directory for per-market WAL files. Defaults to `apps/exchange/data`.



### Application-layer infra

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:logs
```

See `infra/README.md` for service details.

### Engine gateway

The engine gateway is the only application-layer service that talks to the exchange:

```bash
pnpm dev:gateway
```

By default this wires both markets to the same exchange URL (`EXCHANGE_URL` / `EXCHANGE_PERP_URL` → `:4010`). It consumes commands from `orders:commands`, routes by `market`, consumes exchange SSE, and publishes order events / live MD. Commands may include `leverage` (perps) and optional `market` on `CREDIT`.

### Order Management Service

OMS owns product-facing order state in Postgres:

```bash
pnpm dev:oms
```

It exposes order APIs at `http://localhost:4030`, publishes place/cancel commands to Redis Streams, and consumes gateway events to update the order database. OMS loads `DATABASE_URL` from `packages/db/.env` when the variable is not already set.

### Market-data writer

The market-data writer persists the durable `md:events` stream into TimescaleDB:

```bash
pnpm dev:market-data
```

It serves historical trades, BBO snapshots, and one-minute candles at
`http://localhost:4040`.

For non-local deployments, set the same value as `OMS_INTERNAL_TOKEN` on OMS and the web app. Set `GATEWAY_INTERNAL_TOKEN` on the engine gateway and the same value as `ENGINE_GATEWAY_INTERNAL_TOKEN` on the web app. Set `MARKET_DATA_INTERNAL_TOKEN` on the market-data writer and web app, and point `MARKET_DATA_URL` at the writer service.

See [API.md](API.md) for request IDs, error envelopes, order pagination, and
the public BFF/internal service boundaries.

## Exchange API

Each exchange process serves one market (`SOL-USD` or `SOL-USD-PERP`). Command, balance, book, and stream APIs require `x-gateway-token`. Only `/health` is public.


| Method   | Path                                           | Purpose                                              |
| -------- | ---------------------------------------------- | ---------------------------------------------------- |
| `GET`    | `/health`                                      | Process health and active market                     |
| `POST`   | `/v1/markets/:market/credit`                   | Internal gateway credit operation                    |
| `POST`   | `/v1/markets/:market/orders`                   | Place a limit or market order (`leverage` for perps) |
| `DELETE` | `/v1/markets/:market/orders/:orderId`          | Cancel an order                                      |
| `GET`    | `/v1/markets/:market/orders/:orderId`          | Fetch one order                                      |
| `GET`    | `/v1/markets/:market/orders?userId=&openOnly=` | Fetch user orders                                    |
| `GET`    | `/v1/markets/:market/balances/:userId`         | Fetch engine balances                                |
| `GET`    | `/v1/markets/:market/positions`                | List positions (perp)                                |
| `GET`    | `/v1/markets/:market/positions/:userId`        | Fetch one user position                              |
| `GET`    | `/v1/markets/:market/mark`                     | Mark price (BBO mid or last trade)                   |
| `GET`    | `/v1/markets/:market/book`                     | Fetch order book snapshot                            |
| `GET`    | `/v1/markets/:market/stream?userId=`           | Subscribe to live SSE                                |


Notable engine rules:

- Units are integer-only.
- Spot market buys require `quoteBudget`; perp MARKET orders require `quoteBudget` on both sides (notional cap for margin).
- Perps lock USD margin (`ceil(notional / leverage)`); fills update positions and realize PnL — no SOL delivery.
- `FOK_BUDGET` is a market-buy-only fill-or-kill order. It must fill the
requested quantity within `quoteBudget` or reject before matching.
- The exchange `BalanceStore` and its WAL are authoritative for trading balances.
- Postgres `UsdWallet` is legacy onboarding data, not an execution balance.



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

## Project status



### Implemented

- Spot exchange engine for `SOL-USD` and perp engine for `SOL-USD-PERP`
- Spot balance locking / delivery settlement; perp USD margin + positions + PnL
- WAL persistence with checkpoints and replay (positions in snapshot v2)
- Mark price helper (BBO mid / last trade)
- HTTP commands and queries (including positions + mark)
- SSE for live order, credit, BBO, trade, and position events
- Web app authentication, paper funding, and dashboard / trade UX (spot)
- Application-layer infra bootstrap and shared message contracts
- Engine gateway multi-market routing (spot + optional perp URL)
- OMS order APIs, Postgres order state, transactional command outbox, and event-driven status updates
- Market-data writer (TimescaleDB history for trades, BBO, and one-minute candles per market)



### In progress

- Perp trading UI (market switcher, leverage, positions panel)
- Liquidation engine and funding payments
- Authenticated application gateway hardening for non-local deployments

