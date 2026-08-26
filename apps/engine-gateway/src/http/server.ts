import { Hono } from "hono";

export function createGatewayApp() {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "engine-gateway",
    }),
  );

  return app;
}
