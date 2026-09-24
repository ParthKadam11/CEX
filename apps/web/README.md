# `@cex/web`

Next.js trading UI + BFF: Google auth, Spot / Perps desks, charts, and proxies to OMS / gateway / market-data.

## Local setup

From the repo root:

```bash
pnpm infra:up
pnpm setup:local
# edit apps/web/.env — set GOOGLE_* and NEXTAUTH_SECRET
pnpm dev:stack
```

Open http://localhost:3000.

Web only (backends already running):

```bash
pnpm dev
```

### Local env (`apps/web/.env`)

`setup:local` creates this from `.env.example` if missing. Typical local values:

```env
DATABASE_URL=postgresql://postgres:mysecretpassword@127.0.0.1:5432/postgres
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
OMS_URL=http://127.0.0.1:4030
OMS_INTERNAL_TOKEN=local-dev-oms-token
ENGINE_GATEWAY_URL=http://127.0.0.1:4020
ENGINE_GATEWAY_PUBLIC_URL=http://127.0.0.1:4020
ENGINE_GATEWAY_INTERNAL_TOKEN=local-dev-gateway-token
MARKET_DATA_URL=http://127.0.0.1:4040
MARKET_DATA_INTERNAL_TOKEN=local-dev-market-data-token
```

OAuth redirect for local: `http://localhost:3000/api/auth/callback/google`.

In local/dev, the market stream may use the BFF `/api/market/stream` fallback if a direct gateway ticket is unavailable. Force direct SSE with `NEXT_PUBLIC_REQUIRE_DIRECT_SSE=true`.

## What it does

- Google sign-in (NextAuth); user row in Postgres via `@cex/db`
- Dashboard: paper balances, orders, paper credit
- Spot (`SOL-USD`) and Perps (`SOL-USD-PERP`)
- Charts / history via market-data
- Shared market sim when `SIM_HEARTBEAT=true` (one quote and at most one print per tick). Controls and wipe require `SIM_OPERATOR_EMAILS` in production.

## Main routes

| Route | Purpose |
| --- | --- |
| `/` | Landing |
| `/dashboard` | Balances + orders |
| `/spot` | Spot desk |
| `/perps` | Perps desk |
| `/dashboard/orders` | Order history |
| `/dashboard/apps` | Market explorer |
| `/api/auth/[...nextauth]` | NextAuth |
| `/api/orders` | OMS proxy |
| `/api/market/*` | Gateway / balances / credit / stream ticket |
| `/api/sim/market-maker` | Simulation controls |

## Production notes

When deploying behind HTTPS, set `NEXTAUTH_URL` and `ENGINE_GATEWAY_PUBLIC_URL` to public origins; match backend tokens. Set `SIM_OPERATOR_EMAILS` to the Google accounts that may drive the sim. In production, browsers EventSource the gateway after `/api/market/stream-ticket` (BFF stream is off unless `ALLOW_BFF_MARKET_STREAM=true`). See [`infra/DEPLOY.md`](../../infra/DEPLOY.md).
