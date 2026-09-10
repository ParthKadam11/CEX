# Deploying CEX

Target layout:

| Piece | Where |
| --- | --- |
| Web (`apps/web`) | **Vercel** |
| Exchange, gateway, OMS, ingester, Redis | **Render** (`render.yaml`) |
| App Postgres | **Neon** (`DATABASE_URL`) |
| Market-data Timescale | **TigerCloud** (or any Timescale) (`TIMESCALE_URL`) |

Local Docker Compose (`pnpm infra:up`) is for development only.

## Architecture on deploy

```text
Browser ──HTTPS──► Vercel (Next.js BFF + auth)
                      │
                      ├─ OMS_URL ──────────────► cex-oms (Render web)
                      ├─ ENGINE_GATEWAY_URL ───► cex-gateway (Render web)
                      └─ MARKET_DATA_URL ──────► cex-ingester (Render web)

Browser ──EventSource──► ENGINE_GATEWAY_PUBLIC_URL/markets/…/stream?ticket=…
                         (ticket issued by Vercel after Google session)

cex-gateway ──private──► cex-exchange:10000  (+ WAL disk)
OMS / gateway / ingester ──► Render Key Value (Redis)
OMS ──► Neon
ingester ──► TigerCloud
```

## 1. External databases

### Neon (Postgres)

1. Create a Neon project / database.
2. Copy the connection string (`DATABASE_URL`).
3. You will paste it into Render **cex-oms** and Vercel.

### TigerCloud / Timescale

1. Create a Timescale-compatible Postgres database.
2. Copy `TIMESCALE_URL` for **cex-ingester**.
3. Ingester runs its own schema migrate on boot.
4. SSL: if logs show `self-signed certificate in certificate chain`, deploy the latest ingester fix, or set `TIMESCALE_SSL_REJECT_UNAUTHORIZED=false` / use `?sslmode=no-verify` on the URL.

### Redis

Created by the blueprint (`cex-redis`). Prefer **internal-only** (`ipAllowList: []`). Do not point Vercel at Redis unless you intentionally open it.

## 2. Render blueprint

From the [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint** → connect this repo (blueprint file: `render.yaml` at the repo root).

Grant Render access to the GitHub repo if the clone log warns about permissions.

**Build command note:** On Render do **not** use `corepack enable` (`EROFS`) or `pnpm i -g …` (no global bin). Use:

```bash
npx pnpm@10.14.0 install --frozen-lockfile
```

Pin Node via root `engines.node` / `.node-version` (`20.x`). Avoid relying on the newest Node Render picks from `>=20`.

`pnpm install` runs `@cex/db` `postinstall` → `prisma generate`. That must **not** require `DATABASE_URL` (exchange/gateway have none). `packages/db/prisma.config.ts` uses `process.env.DATABASE_URL` for that reason.

Start (repo root, empty Root Directory):

```bash
npx pnpm@10.14.0 --filter @cex/<app> start
```

Services created:

| Name | Type | Notes |
| --- | --- | --- |
| `cex-redis` | Key Value | Streams + pub/sub; `noeviction` |
| `cex-exchange` | Private service | Disk at `/opt/render/project/src/apps/exchange/data` |
| `cex-gateway` | Web | Public HTTPS; browser SSE |
| `cex-oms` | Web | Public HTTPS; `preDeployCommand` runs `pnpm db:migrate:deploy` |
| `cex-ingester` | Web | Public HTTPS; history API |

On first sync, Render prompts for:

- `DATABASE_URL` (OMS)
- `TIMESCALE_URL` (ingester)
- `CORS_ORIGINS` (gateway) — e.g. `https://your-app.vercel.app` (comma-separated). Default in code is `*` if unset at runtime; set this in production.

Generated secrets (`GATEWAY_INTERNAL_TOKEN`, `OMS_INTERNAL_TOKEN`, `INGESTER_INTERNAL_TOKEN`, `EXCHANGE_GATEWAY_TOKEN`) appear in each service’s **Environment** tab. Copy them into Vercel as below.

### Ports

All Render services prefer `process.env.PORT` (platform-assigned). The exchange private service pins `PORT=10000` so gateway can use a stable internal URL:

```text
EXCHANGE_URL=http://cex-exchange:10000
```

You do **not** expose local ports `4010`–`4040` on Render.

### WAL disk

`cex-exchange` should use a **persistent disk** (paid Render plan). Without it, WAL files live on the ephemeral filesystem and are wiped on redeploy.

**Recommended Mount Path** (allowed Node subdir of the source tree):

```text
/opt/render/project/src/apps/exchange/data
```

Set `EXCHANGE_DATA_DIR` to that **exact** same path.

**Manual service:** Disks → Add disk → Mount Path as above → Manual Deploy.

**Boot without a disk (bring-up only):**

```env
EXCHANGE_DATA_DIR=/opt/render/project/src/apps/exchange/data
```

That path is writable on Render without attaching a disk, but data is lost on redeploy until a disk is mounted there.

Do **not** use `/data` or `/var/data/...` unless you have actually attached a disk at that path — otherwise you get `EACCES`.

Disks force a single instance and brief downtime on deploy — expected for this engine.

## 3. Vercel (web)

1. Import `apps/web` (or the monorepo with Root Directory / filter for `@cex/web`).
2. Set environment variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon URL (same as OMS) |
| `NEXTAUTH_SECRET` | long random string |
| `NEXTAUTH_URL` | `https://<your-vercel-domain>` (preview can rely on `VERCEL_URL`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth |
| `OMS_URL` | `https://cex-oms.onrender.com` (exact Render URL) |
| `ENGINE_GATEWAY_URL` | `https://cex-gateway.onrender.com` |
| `ENGINE_GATEWAY_PUBLIC_URL` | **same** as `ENGINE_GATEWAY_URL` (browser EventSource) |
| `MARKET_DATA_URL` | `https://cex-ingester.onrender.com` |
| `OMS_INTERNAL_TOKEN` | copy from Render `cex-oms` |
| `ENGINE_GATEWAY_INTERNAL_TOKEN` | copy from Render `cex-gateway` (`GATEWAY_INTERNAL_TOKEN`) |
| `MARKET_DATA_INTERNAL_TOKEN` | copy from Render `cex-ingester` (`INGESTER_INTERNAL_TOKEN`) |

3. Google Cloud Console → OAuth redirect URI:

```text
https://<your-vercel-domain>/api/auth/callback/google
```

Optional:

```env
AUTH_EMAIL_SUFFIX=@gmail.com
# SIM_HEARTBEAT=false
```

### Market maker / sim

`SIM_HEARTBEAT` runs inside the Next.js Node process. On Vercel serverless this is unreliable. For a live book in production, run the stack with a long-lived web instance or drive ticks from a Render cron/worker later. For demos, keep sim on a always-on host or accept cold starts.

## 4. Smoke checklist

After deploy:

```bash
curl -sS https://cex-gateway.onrender.com/health/live
curl -sS https://cex-oms.onrender.com/health/live
curl -sS https://cex-ingester.onrender.com/health/live
# private — only from gateway network / Render shell:
# curl -sS http://cex-exchange:10000/health
```

Then:

1. Open the Vercel site → Google sign-in.
2. Spot / Perps → paper **Add USD / Add SOL**.
3. Confirm SSE connected (book updates).
4. Place / cancel an order.
5. Restart **cex-exchange** on Render → balances/book should return from WAL (same disk).

## 5. Common failures

| Symptom | Likely cause |
| --- | --- |
| Render health check fails | App not listening on `PORT` (fixed in code: prefer `PORT`) |
| Vercel 502 to OMS/gateway | Wrong `*_URL` or token mismatch |
| SSE never connects | Missing `ENGINE_GATEWAY_PUBLIC_URL`, or gateway blocked; check CORS |
| Empty book / `EACCES mkdir` on exchange | `EXCHANGE_DATA_DIR` points at a path with no disk (e.g. `/data`). Use `/opt/render/project/src/apps/exchange/data` |
| OMS migrate fails | Bad `DATABASE_URL` or Neon IP allowlist |
| Google login loop | `NEXTAUTH_URL` / callback URI mismatch |

## 6. Local vs production URLs

| Local | Production |
| --- | --- |
| `http://127.0.0.1:4010` | `http://cex-exchange:10000` (private) |
| `http://127.0.0.1:4020` | `https://cex-gateway.onrender.com` |
| `http://127.0.0.1:4030` | `https://cex-oms.onrender.com` |
| `http://127.0.0.1:4040` | `https://cex-ingester.onrender.com` |
| `./apps/exchange/data` | `/opt/render/project/src/apps/exchange/data` |

Never leave `127.0.0.1` in Vercel or Render service-to-service URLs.
