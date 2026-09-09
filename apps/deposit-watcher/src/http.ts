import { Hono } from "hono";
import { prisma } from "@cex/db";
import { pingRedis } from "@cex/logger";
import type { Redis } from "ioredis";
import { assertDevnetOnly } from "@cex/solana";

export function createWatcherApp(redis: Redis) {
  const app = new Hono();

  app.get("/health/live", (c) =>
    c.json({ ok: true, service: "deposit-watcher", live: true }),
  );

  app.get("/health", async (c) => {
    let database = { ok: true as boolean, detail: undefined as string | undefined };
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      database = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    const redisCheck = await pingRedis(redis);
    let solana = { ok: true as boolean, detail: undefined as string | undefined };
    try {
      assertDevnetOnly();
    } catch (error) {
      solana = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    const ok = database.ok && redisCheck.ok && solana.ok;
    return c.json(
      {
        ok,
        service: "deposit-watcher",
        dependencies: {
          database,
          redis: redisCheck,
          solana,
        },
      },
      ok ? 200 : 503,
    );
  });

  return app;
}
