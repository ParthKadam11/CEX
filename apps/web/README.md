# `@cex/web`

`@cex/web` is the user-facing application: Google auth and an authenticated SOL-USD trading surface against the exchange engine.

## What it does today

- Google sign-in with NextAuth
- user creation in PostgreSQL through `@cex/db`
- simulated USD wallet row on first sign-in (legacy DB record)
- dashboard with engine trading balances and recent orders
- authenticated SOL-USD order book, balances, order placement, and cancellation
- paper credit into the engine ledger for demo funding
- optional in-app market simulation

## Main routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/dashboard` | Balances + recent orders |
| `/trade` | SOL-USD trading surface |
| `/dashboard/trade` | Redirects to `/trade` |
| `/dashboard/apps` | Market explorer (candles, book, history) |
| `/api/auth/[...nextauth]` | NextAuth handlers |
| `/api/orders` | Authenticated OMS order proxy |
| `/api/market/book` | Authenticated SOL-USD book proxy |
| `/api/market/stream` | Authenticated SOL-USD market-data stream proxy |
| `/api/market/credit` | Paper-fund engine balances |
| `/api/sim/market-maker` | Dev market simulation |

## Key implementation details

- Authentication uses Google through NextAuth.
- On first sign-in, the app creates a `User` and a legacy simulated `UsdWallet` record.
- The authenticated Prisma user id is copied to `session.user.uid`.
- The exchange engine ledger is authoritative for trading balances; the web app reads balances through the engine gateway.

## Running locally

From the repository root:

```bash
pnpm dev
```

Or from this package:

```bash
pnpm dev
```

The app runs at `http://localhost:3000`.

## Required environment

Create `apps/web/.env`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@localhost:5432/cex
OMS_URL=http://127.0.0.1:4030
ENGINE_GATEWAY_URL=http://127.0.0.1:4020
```

Then generate the Prisma client and run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

## Service authentication

The web app acts as the authenticated BFF. It derives the user id from NextAuth and sends it to OMS only through a trusted internal header. Configure the same `OMS_INTERNAL_TOKEN` on the web app and OMS, and the same `ENGINE_GATEWAY_INTERNAL_TOKEN` on the web app and `GATEWAY_INTERNAL_TOKEN` on the gateway for non-local deployments.
