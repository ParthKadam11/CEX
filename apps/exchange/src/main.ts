import path from "node:path";
import { serve } from "@hono/node-server";
import { EventBus } from "./api/eventBus.js";
import { createExchangeApp } from "./api/server.js";
import { MarketRuntime } from "./market/runtime.js";

/*
  Exchange process entrypoint.

  REST  → place / cancel / credit / queries / book
  SSE   → /v1/markets/:market/stream  (ORDER, BBO, CREDIT)

  No gRPC — HTTP request/response is the sync API the gateway calls.
*/

const market = "SOL-USD" as const;
const port = Number(process.env.EXCHANGE_PORT ?? 4010);
const walPath =
  process.env.EXCHANGE_WAL_PATH ??
  path.join(process.cwd(), "data", `${market}.jsonl`);

const bus = new EventBus();
const runtime = MarketRuntime.open(market, walPath, bus);
const app = createExchangeApp(runtime, bus);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `exchange listening on http://localhost:${info.port} market=${market} wal=${walPath}`,
  );
});
