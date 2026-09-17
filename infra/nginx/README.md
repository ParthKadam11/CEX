# nginx samples

**Not used for local `pnpm dev:stack`.** Locally you hit http://localhost:3000 and http://127.0.0.1:4020 directly.

These files are examples for a **single-host** public deploy (TLS via certbot):

| File | Proxies to |
| --- | --- |
| `papertrade.conf` | `127.0.0.1:3000` (Next.js) |
| `papertrade-gw.conf` | `127.0.0.1:4020` (gateway; SSE-friendly) |

Rename `server_name`, enable under nginx, then certbot. Keep gateway buffering off and long read timeouts for EventSource.

Deploy steps: [`../DEPLOY.md`](../DEPLOY.md) §1.
