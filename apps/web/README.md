# `@cex/web`

Next.js trading UI + BFF for the paper exchange: Google auth, Spot / Perps desks, charts, and proxies to OMS / gateway / market-data.

## Production

| | URL |
| --- | --- |
| App | https://papertrade.parthkadam.tech |
| Gateway SSE | https://papertrade-gw.parthkadam.tech |

Runs on the Contabo VPS under PM2 (`cex-web`), behind nginx TLS. Live market streams use **direct SSE** to the gateway (ticket from `/api/market/stream-ticket`); the BFF `/api/market/stream` path is not used in production.

Deploy: push to `main` → GitHub Actions **CI** → **Deploy** (SSH pull + `pnpm build:web` + `pm2 reload`).

## What it does

- Google sign-in (NextAuth)
- User row in Postgres via `@cex/db`
- Dashboard: paper balances, open/recent orders, paper credit
- Spot (`SOL-USD`) and Perps (`SOL-USD-PERP`) trading surfaces
- Charts / history via market-data API
- Optional in-app market simulation controls

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

## Local

```bash
pnpm infra:up
pnpm setup:local
# fill GOOGLE_* + NEXTAUTH_SECRET in apps/web/.env
pnpm dev:stack
```

Web only (backends already up): `pnpm dev` → http://localhost:3000

## Required env (`apps/web/.env`)

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

Production: set `NEXTAUTH_URL` and `ENGINE_GATEWAY_PUBLIC_URL` to the HTTPS hosts above. Tokens must match the backend services.
