/**
 * PM2 process file for Contabo VPS (infra stays in Docker Compose).
 *
 * From repo root:
 *   pnpm --filter @cex/db db:generate
 *   pnpm --filter @cex/web build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "cex-exchange",
      cwd: root,
      script: "pnpm",
      args: "--filter @cex/exchange start",
      env: { NODE_ENV: "production" },
      max_restarts: 20,
      min_uptime: "5s",
    },
    {
      name: "cex-gateway",
      cwd: root,
      script: "pnpm",
      args: "--filter @cex/engine-gateway start",
      env: { NODE_ENV: "production" },
      max_restarts: 20,
      min_uptime: "5s",
    },
    {
      name: "cex-oms",
      cwd: root,
      script: "pnpm",
      args: "--filter @cex/oms start",
      env: { NODE_ENV: "production" },
      max_restarts: 20,
      min_uptime: "5s",
    },
    {
      name: "cex-ingester",
      cwd: root,
      script: "pnpm",
      args: "--filter @cex/ingester start",
      env: { NODE_ENV: "production" },
      max_restarts: 20,
      min_uptime: "5s",
    },
    {
      name: "cex-web",
      cwd: root,
      script: "pnpm",
      args: "--filter @cex/web start",
      env: { NODE_ENV: "production" },
      max_restarts: 20,
      min_uptime: "5s",
    },
  ],
};
