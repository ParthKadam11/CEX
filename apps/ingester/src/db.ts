import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import type { MarketDataEvent } from "@cex/app-contracts";

const migrationFile = fileURLToPath(
  new URL("../migrations/001_market_data.sql", import.meta.url),
);

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    // Managed Timescale/Tiger often presents an intermediate CA Node doesn't trust
    // when sslmode=require is treated as verify-full (pg v8).
    ssl: sslForConnectionString(connectionString),
  });
}

function sslForConnectionString(
  connectionString: string,
): boolean | { rejectUnauthorized: boolean } | undefined {
  if (process.env.TIMESCALE_SSL_REJECT_UNAUTHORIZED === "true") {
    return { rejectUnauthorized: true };
  }
  if (process.env.TIMESCALE_SSL_REJECT_UNAUTHORIZED === "false") {
    return { rejectUnauthorized: false };
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return undefined;
  }

  const host = url.hostname;
  const local = host === "127.0.0.1" || host === "localhost";
  if (local) return undefined;

  const sslmode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  // Remote managed Postgres: encrypt, but don't fail on provider CA chains.
  if (
    sslmode === "" ||
    sslmode === "require" ||
    sslmode === "prefer" ||
    sslmode === "verify-ca" ||
    sslmode === "no-verify"
  ) {
    return { rejectUnauthorized: false };
  }
  if (sslmode === "verify-full") {
    return { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

export async function runMigrations(pool: Pool): Promise<void> {
  const sql = fs.readFileSync(path.resolve(migrationFile), "utf8");
  await pool.query(sql);
}

export async function persistEvents(
  pool: Pool,
  events: readonly MarketDataEvent[],
): Promise<void> {
  if (events.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const event of events) {
      if (event.kind === "TRADE") {
        await persistTrade(client, event);
      } else {
        await persistBbo(client, event);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function persistTrade(
  client: PoolClient,
  event: Extract<MarketDataEvent, { kind: "TRADE" }>,
): Promise<void> {
  const payload = event.payload;
  const key = await client.query(
    `INSERT INTO trade_tick_keys (market, trade_id, first_seen)
     VALUES ($1, $2, $3)
     ON CONFLICT (market, trade_id) DO NOTHING
     RETURNING trade_id`,
    [payload.market, payload.tradeId, new Date(payload.timestamp)],
  );
  if (key.rowCount !== 1) return;

  await client.query(
    `INSERT INTO trade_ticks
      (time, market, trade_id, event_id, engine_sequence, price, quantity,
       buy_order_id, sell_order_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING`,
    [
      new Date(payload.timestamp),
      payload.market,
      payload.tradeId,
      event.eventId,
      payload.engineSequence,
      payload.price,
      payload.quantity,
      payload.buyOrderId,
      payload.sellOrderId,
    ],
  );
}

async function persistBbo(
  client: PoolClient,
  event: Extract<MarketDataEvent, { kind: "BBO" }>,
): Promise<void> {
  const payload = event.payload;
  await client.query(
    `INSERT INTO bbo_snapshots
      (time, market, event_id, engine_sequence, best_bid, best_ask)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (market, time, engine_sequence) DO NOTHING`,
    [
      new Date(payload.timestamp),
      payload.market,
      event.eventId,
      payload.engineSequence,
      payload.bestBid,
      payload.bestAsk,
    ],
  );
}
