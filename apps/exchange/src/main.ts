import path from "node:path";
import { serve } from "@hono/node-server";
import { EventBus } from "./api/eventBus.js";
import { createExchangeApp } from "./api/server.js";
import { MarketRuntime } from "./market/runtime.js";

/*
  Exchange process entrypoint.

  REST  → place / cancel / credit / queries / book
  SSE   → /v1/markets/:market/stream  (ORDER, BBO, CREDIT)
*/

const market = "SOL-USD" as const;
const port = Number(process.env.EXCHANGE_PORT ?? 4010);
const gatewayToken = serviceToken(
  "EXCHANGE_GATEWAY_TOKEN",
  "local-dev-exchange-token",
);
const walPath =
  process.env.EXCHANGE_WAL_PATH ??
  path.join(process.cwd(), "data", `${market}.jsonl`);

const bus = new EventBus();
const runtime = MarketRuntime.open(market, walPath, bus);
const app = createExchangeApp(runtime, bus, { gatewayToken });

const shutdown = () => {
  void runtime.close().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `exchange listening on http://localhost:${info.port} market=${market} wal=${walPath}`,
  );
});

function serviceToken(name: string, fallback: string): string {
  const token = process.env[name];
  if (process.env.NODE_ENV === "production" && !token) {
    throw new Error(`${name} is required in production`);
  }
  return token ?? fallback;
}
