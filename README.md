# CEX

A centralized crypto exchange built as a monorepo: a custodial Solana web app plus a from-scratch order-matching exchange engine.

The engine (order book, matching, time-in-force, order lifecycle) is written and tested in isolation. The web app currently handles auth and custodial wallet flows (deposit / withdraw over Solana devnet); trading is not yet wired end-to-end.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Web:** Next.js 16, React 19, Tailwind v4, NextAuth (Google), Solana wallet-adapter
- **Exchange engine:** TypeScript, tested with Vitest
- **Data:** Prisma + Postgres
- **Chain:** Solana (devnet by default)

## Layout

```
CEX/
├── apps/
│   ├── web/          # Next.js app: auth, custodial wallet, deposit/withdraw
│   └── exchange/     # matching engine, order book, order lifecycle (in-memory)
└── packages/
    ├── exchange-types/   # shared exchange domain types (@cex/exchange-types)
    ├── db/               # Prisma client + schema (@cex/db)
    ├── solana/           # Solana RPC helpers (@cex/solana)
    └── typescript-config/ # shared tsconfig bases
```

## Prerequisites

- Node `>=20`
- pnpm `10.14.0` (`corepack enable`)
- Postgres (for the web app / Prisma)

## Setup

```bash
pnpm install
```

Create `apps/web/.env` (the running process owns its env; Next only reads `apps/web/.env`):

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

Generate the Prisma client and run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

## Running

```bash
pnpm dev            # web app at http://localhost:3000
pnpm build          # build all packages via turbo
pnpm test:exchange  # run the exchange engine test suite
```

## Exchange engine

Lives in `apps/exchange`. Runs single-threaded per market (LMAX-style), all in-memory for now.

```
src/
  market/      # base/quote + lock-amount helpers
  book/        # order book + price levels
  matching/    # MatchingEngine
  placement/   # OrderPlacementService (TIF + balances orchestration)
  order/       # state machine, store, queries, event log, helpers
  account/     # BalanceStore, Ledger, BalanceService
  test/        # shared test helpers
```

| Area | What it does |
|------|--------------|
| `book/` | Order book with `Map` price levels + sorted price arrays for O(1) best bid/ask; FIFO queues per price |
| `matching/matchingEngine.ts` | Price-time priority matching; trades at the maker's price |
| `placement/orderPlacementService.ts` | Time-in-force (GTC / IOC / FOK), lock/settle/unlock balances, rest/cancel leftover |
| `order/` | State machine, event log, live order store + queries |
| `account/` | Available/locked balances + append-only ledger |
| `market/assets.ts` | Market base/quote and lock-amount helpers |

```bash
pnpm --filter @cex/exchange test         # run once
pnpm --filter @cex/exchange test:watch   # watch mode
```

### Status

Built: order book, matching, time-in-force, state machine, event log, order queries, balances/ledger, trade settlement on place (all in-memory + tested).

Not yet: fees, cancel/amend API, persistence, and the HTTP/WS bridge from the web app to the engine.

