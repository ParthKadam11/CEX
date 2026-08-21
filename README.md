# CEX

A centralized crypto exchange built as a monorepo: a custodial Solana web app plus a from-scratch matching engine.

The engine is a standalone process: in-memory book + balances, durable command WAL, REST for commands/queries, SSE for live events. The web app currently handles auth and custodial wallet flows (deposit / withdraw over Solana devnet); trading is not yet wired to the engine.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Web:** Next.js 16, React 19, Tailwind v4, NextAuth (Google), Solana wallet-adapter
- **Exchange engine:** TypeScript, Hono (HTTP + SSE), file WAL, Vitest
- **Data:** Prisma + Postgres (web app)
- **Chain:** Solana (devnet by default)

## Layout

```
CEX/
├── apps/
│   ├── web/              # Next.js: auth, custodial wallet, deposit/withdraw
│   └── exchange/         # matching engine process (HTTP :4010 + WAL)
└── packages/
    ├── exchange-types/   # shared domain types (@cex/exchange-types)
    ├── db/               # Prisma client + schema (@cex/db)
    ├── solana/           # Solana RPC helpers (@cex/solana)
    └── typescript-config/
```

## Prerequisites

- Node `>=20`
- pnpm `10.14.0` (`corepack enable`)
- Postgres (for the web app / Prisma)

## Setup

```bash
pnpm install
```

Create `apps/web/.env` (Next only reads `apps/web/.env`):

```env
# Auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/cex

# Solana (devnet for local testing)
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

```bash
pnpm db:generate
pnpm db:migrate
```

## Running

```bash
pnpm dev                              # web app at http://localhost:3000
pnpm --filter @cex/exchange dev       # engine at http://localhost:4010
pnpm build
pnpm test:exchange                    # unit + integration + e2e
```

Engine env (optional): `EXCHANGE_PORT` (default `4010`), `EXCHANGE_WAL_PATH` (default `apps/exchange/data/SOL-USD.jsonl`).

## Exchange engine

Lives in `apps/exchange`. One market (`SOL-USD`), single-threaded, LMAX-style: RAM for matching, WAL for restart.

```
apps/exchange/
├── src/
│   ├── main.ts          # process entry: runtime + HTTP + SSE
│   ├── api/             # Hono REST + EventBus SSE
│   ├── market/          # MarketRuntime (WAL replay + live commands)
│   ├── book/            # order book + price levels
│   ├── matching/        # MatchingEngine
│   ├── placement/       # place/cancel + TIF + lock/settle/unlock
│   ├── order/           # state machine, store, queries, event log
│   ├── account/         # BalanceStore, Ledger, BalanceService
│   └── journal/         # FileWal (JSONL + fsync)
└── tests/
    ├── unit/
    ├── integration/     # WAL replay (no HTTP)
    └── e2e/             # HTTP → engine → WAL restart
```

| Area | What it does |
|------|--------------|
| `book/` | Price levels + sorted prices; O(1) BBO; FIFO per price |
| `matching/` | Price-time priority; trades at the maker price |
| `placement/` | LIMIT/MARKET, GTC/IOC/FOK, lock/settle/unlock |
| `order/` | Lifecycle, event log, live store + queries |
| `account/` | Available/locked balances + append-only ledger |
| `journal/` | Append CREDIT/PLACE/CANCEL, fsync, replay on boot |
| `api/` | REST commands/queries + SSE (`ORDER`, `BBO`, `CREDIT`) |

### HTTP (market = `SOL-USD`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Process + live market |
| `POST` | `/v1/markets/:market/credit` | Deposit into available |
| `POST` | `/v1/markets/:market/orders` | Place (LIMIT or MARKET) |
| `DELETE` | `/v1/markets/:market/orders/:orderId` | Cancel + unlock leftover |
| `GET` | `/v1/markets/:market/orders/:orderId` | Order by id |
| `GET` | `/v1/markets/:market/orders?userId=&openOnly=` | User orders |
| `GET` | `/v1/markets/:market/balances/:userId` | Balances |
| `GET` | `/v1/markets/:market/book` | Snapshot + BBO |
| `GET` | `/v1/markets/:market/stream?userId=` | SSE live events |

MARKET buy requires `quoteBudget`. Unsupported TIF (`FOK_BUDGET`) is rejected.

```bash
pnpm test:exchange
pnpm test:exchange:unit
pnpm test:exchange:integration
pnpm test:exchange:e2e
```

### Status

**Built:** matching, LIMIT + MARKET, GTC/IOC/FOK, balances/ledger/settlement, cancel, WAL restart, HTTP + SSE. Covered by unit, WAL integration, and HTTP e2e tests.

**Not yet:** fees, amend, FOK_BUDGET, multi-market process, and the web-app gateway to this HTTP/SSE API.
