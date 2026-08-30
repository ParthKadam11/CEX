import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createOmsApp } from "./http/server.js";

const config = loadConfig();
const app = createOmsApp();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`oms listening on http://localhost:${info.port}`);
});
