# nginx samples

**Not used for local `pnpm dev:stack`.** Locally you hit the web and gateway ports on the machine directly.

These files are for the **single-host** public deploy (TLS via certbot):

| File | Role |
| --- | --- |
| `paperdesk.conf` | Main web app |
| `gateway-paperdesk.conf` | Public gateway edge (stream) |
| `papertrade.conf` / `papertrade-gw.conf` | Legacy hostnames |
| `logspapercex.conf` | Optional Grafana front door |

Keep data stores and internal admin ports off the public internet. Use Grafana for ops views when needed.

### Enable / reload on the VPS

```bash
cd ~/apps/CEX/infra/nginx
bash enable-paperdesk.sh   # needs sudo
```

Deploy steps: [`../DEPLOY.md`](../DEPLOY.md) §1.
