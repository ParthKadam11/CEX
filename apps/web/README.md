# `@cex/web`

`@cex/web` is the user-facing application for the repository. It currently focuses on authentication and custodial wallet flows.

## What it does today

- Google sign-in with NextAuth
- user creation in PostgreSQL through `@cex/db`
- custodial Solana wallet creation on first sign-in
- simulated USD wallet creation on first sign-in
- dashboard showing wallet state
- deposit flow from a connected wallet into the custodial address
- withdraw flow from the custodial wallet to a destination address
- recent Solana account activity view

## Main routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/dashboard` | Wallet dashboard for signed-in users |
| `/dashboard/apps` | Placeholder page for future product surfaces |
| `/api/auth/[...nextauth]` | NextAuth handlers |
| `/api/withdraw` | Custodial SOL withdrawal |
| `/api/activity` | Recent account activity lookup |

## Key implementation details

- Authentication uses Google through NextAuth.
- On first sign-in, the app creates:
  - a `User`
  - a custodial `SolWallet`
  - a simulated `UsdWallet` seeded with `STARTING_USD_BALANCE`
- The authenticated Prisma user id is copied to `session.user.uid`.
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
```

Then generate the Prisma client and run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

## Current scope

This package is not yet the trading application. It does not currently place exchange orders or consume the exchange SSE feed. Those responsibilities will be added through the application layer and connected later.
