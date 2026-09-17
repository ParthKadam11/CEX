# Deploying CEX

Day-to-day development is **local**: see the root [README](../README.md) (`pnpm infra:up` → `pnpm setup:local` → `pnpm dev:stack`). This file is only for putting the stack on a public host.

Two deploy shapes:

| | **A — Single host** | **B — Split cloud** |
| --- | --- | --- |
| Apps | Compose + PM2 on one machine | Render (`render.yaml`) |
| Web | Same host + nginx | Vercel |
| Data | Compose Postgres / Timescale / Redis | Neon + TigerCloud + Render Redis |
| Docs | §1 | §2 |

---

## 1. Single host (Compose + PM2 + nginx + Actions)

```text
Browser ──HTTPS──► nginx
                     ├─ <web-host>  → 127.0.0.1:3000  (Next.js)
                     └─ <gw-host>   → 127.0.0.1:4020  (gateway SSE)
```

| Piece | Role |
| --- | --- |
| Docker Compose | Redis, Postgres, Timescale (`127.0.0.1` only) |
| PM2 (`ecosystem.config.cjs`) | exchange, gateway, OMS, ingester, web |
| nginx (`infra/nginx/`) | TLS + reverse proxy |
| certbot | Let’s Encrypt |
| GitHub Actions | CI; optional SSH deploy |

### Bring-up (outline)

Same as local through `pnpm infra:up` / env / migrate, then on the server:

```bash
pnpm build:web
pnpm pm2:start
pm2 save && pm2 startup
```

DNS → server; enable nginx samples; `sudo certbot --nginx -d <web-host> -d <gw-host>`.

### Env differences vs local

| Variable | Local | Production |
| --- | --- | --- |
| `NEXTAUTH_URL` | `http://localhost:3000` | `https://<web-host>` |
| `ENGINE_GATEWAY_PUBLIC_URL` | `http://127.0.0.1:4020` | `https://<gw-host>` |
| `CORS_ORIGINS` | optional | `https://<web-host>` |
| Internal tokens | `local-dev-*` from `.env.example` | random; keep pairs matched |

Production SSE is **direct to the gateway** (ticket from the BFF). Deploy secrets for Actions: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY_B64`.

---

## 2. Split cloud (Vercel + Render)

| Piece | Where |
| --- | --- |
| Web | **Vercel** |
| Exchange, gateway, OMS, ingester, Redis | **Render** |
| Postgres | **Neon** |
| Timescale | **TigerCloud** (or compatible) |

```text
Browser ──HTTPS──► Vercel
                      ├─ OMS / gateway / market-data URLs ──► Render
Browser ──EventSource──► ENGINE_GATEWAY_PUBLIC_URL/…/stream?ticket=…
```

Use `render.yaml` blueprint; build with `npx pnpm@10.14.0 install --frozen-lockfile`. Pin Node 20.x. Mount a WAL disk for exchange and set `EXCHANGE_DATA_DIR`. Copy generated tokens into Vercel; set gateway `CORS_ORIGINS` to the Vercel origin. OAuth callback: `https://<vercel-domain>/api/auth/callback/google`.

Never use `127.0.0.1` in Vercel ↔ Render URLs. `SIM_HEARTBEAT` is unreliable on Vercel serverless.

| Symptom | Likely cause |
| --- | --- |
| SSE error | `ENGINE_GATEWAY_PUBLIC_URL` / `CORS_ORIGINS` / token mismatch |
| 502 BFF → backends | Wrong URL or token |
| Empty book / `EACCES` | `EXCHANGE_DATA_DIR` without a disk |
| Google login loop | `NEXTAUTH_URL` / redirect mismatch |
