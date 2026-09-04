# `@cex/web`

`@cex/web` is the user-facing application for the repository. It provides authentication, custodial wallet flows, and the authenticated SOL-USD trading surface.

## What it does today

- Google sign-in with NextAuth
- user creation in PostgreSQL through `@cex/db`
- custodial Solana wallet creation on first sign-in
- simulated USD wallet creation on first sign-in
- dashboard showing wallet state
- authenticated SOL-USD order book, balances, order placement, and cancellation
- deposit flow from a connected wallet into the custodial address
- withdraw flow from the custodial wallet to a destination address
- recent Solana account activity view

## Main routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/dashboard` | Wallet dashboard for signed-in users |
| `/trade` | SOL-USD trading surface |
| `/dashboard/trade` | Redirects to `/trade` |
| `/dashboard/apps` | Market explorer (candles, book, history) |
| `/api/auth/[...nextauth]` | NextAuth handlers |
| `/api/orders` | Authenticated OMS order proxy |
| `/api/market/book` | Authenticated SOL-USD book proxy |
| `/api/market/stream` | Authenticated SOL-USD market-data stream proxy |
| `/api/withdraw` | Custodial SOL withdrawal |
| `/api/activity` | Recent account activity lookup |

## Key implementation details

- Authentication uses Google through NextAuth.
- On first sign-in, the app creates:
  - a `User`
  - a custodial `SolWallet`
  - a legacy simulated `UsdWallet` record
- The authenticated Prisma user id is copied to `session.user.uid`.
- The exchange engine ledger is authoritative for trading balances; the web app reads balances through the engine gateway.
- Solana RPC helpers are imported from `@cex/solana`.

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
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
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
