import { Hono } from "hono";

export function createOmsApp() {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "oms",
    }),
  );

  return app;
}
