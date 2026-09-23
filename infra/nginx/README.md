# nginx samples

**Not used for local `pnpm dev:stack`.** Locally you hit http://localhost:3000 and http://127.0.0.1:4020 directly.

These files are examples for a **single-host** public deploy (TLS via certbot):

| File | Proxies to |
| --- | --- |
| `papertrade.conf` | `127.0.0.1:3000` (Next.js) |
| `papertrade-gw.conf` | `127.0.0.1:4020` (gateway; SSE-friendly) |
| `logspapercex.conf` | `127.0.0.1:3001` (Grafana — metrics + Loki logs) |

Do **not** proxy Loki (`3100`) or Prometheus (`9090`) publicly. Use Grafana Explore / dashboards.

### Public Grafana / logs (`logspapercex.parthkadam.tech`)

1. DNS **A** record → VPS IP  
2. Enable nginx sample + certbot  
3. Recreate Grafana with public URL:

```bash
export GRAFANA_ROOT_URL=https://logspapercex.parthkadam.tech
docker compose -f infra/docker-compose.yml up -d --force-recreate grafana
```

Login: `admin` / `cex-grafana-change-me` (change it).  
Logs: **Explore → Loki** → `{job="pm2"}` or dashboard **PaperDesk PM2 Logs**.

Rename `server_name`, enable under nginx, then certbot. Keep gateway buffering off and long read timeouts for EventSource.

Deploy steps: [`../DEPLOY.md`](../DEPLOY.md) §1.
