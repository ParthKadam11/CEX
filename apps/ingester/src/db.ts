import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parsePgUrl } from "pg-connection-string";
import { Pool, type PoolClient } from "pg";
import type { MarketDataEvent } from "@cex/app-contracts";

const migrationFile = fileURLToPath(
  new URL("../migrations/001_market_data.sql", import.meta.url),
);

export type TimescaleSslOption =
  | boolean
  | { rejectUnauthorized: boolean }
  | undefined;

/** Trim + strip wrapping quotes people paste into Render env values. */
export function normalizeTimescaleUrl(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function createPool(connectionString: string): Pool {
  const trimmed = normalizeTimescaleUrl(connectionString);
  if (!trimmed) {
    throw new Error(
      "TIMESCALE_URL is empty. Set the full TigerCloud connection string on cex-ingester (user:password@host).",
    );
  }

  const ssl = sslForConnectionString(trimmed);
  const stripped = stripSslQueryParams(trimmed);
  const parsed = parsePgUrl(stripped);

  // pg SCRAM throws "client password must be a string" when password is undefined.
  // Missing userinfo in the URL usually parses as "" — treat that the same for remotes.
  const password =
    parsed.password === undefined || parsed.password === null
      ? ""
      : String(parsed.password);
  const host = parsed.host ?? "";
  const local = host === "127.0.0.1" || host === "localhost" || host === "";
  if (!local && password.length === 0) {
    throw new Error(
      "TIMESCALE_URL has no password (got user/host only). " +
        "In Render → cex-ingester → Environment, paste the full URL from TigerCloud, " +
        "shaped like postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require " +
        "(URL-encode special characters in PASSWORD). Do not wrap the value in quotes.",
    );
  }

  return new Pool({
    host: parsed.host ?? undefined,
    port: parsed.port ? Number(parsed.port) : undefined,
    user: parsed.user ?? undefined,
    // Always a string so SCRAM never sees undefined (empty only allowed for local).
    password,
    database: parsed.database ?? undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    ...(ssl !== undefined ? { ssl } : {}),
  });
}

/**
 * Remove sslmode / uselibpqcompat / ssl query params without touching userinfo.
 * Regex-only so passwords with `@`, `#`, `%`, etc. stay intact.
 */
export function stripSslQueryParams(connectionString: string): string {
  const q = connectionString.indexOf("?");
  if (q === -1) return connectionString;

  const base = connectionString.slice(0, q);
  const kept = connectionString
    .slice(q + 1)
    .split("&")
    .filter((part) => {
      if (!part) return false;
      const key = part.split("=", 1)[0]?.toLowerCase();
      return key !== "sslmode" && key !== "ssl" && key !== "uselibpqcompat";
    });

  return kept.length > 0 ? `${base}?${kept.join("&")}` : base;
}

/**
 * SSL for Timescale / TigerCloud / managed Postgres.
 *
 * pg v8 treats sslmode=require as verify-full, which fails on provider CA chains
 * ("self-signed certificate in certificate chain"). Remote URLs default to
 * encrypt + rejectUnauthorized:false. Override with:
 *   TIMESCALE_SSL_REJECT_UNAUTHORIZED=true|false
 * or sslmode=verify-full|no-verify on the URL.
 */
export function sslForConnectionString(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env,
): TimescaleSslOption {
  if (env.TIMESCALE_SSL_REJECT_UNAUTHORIZED === "true") {
    return { rejectUnauthorized: true };
  }
  if (env.TIMESCALE_SSL_REJECT_UNAUTHORIZED === "false") {
    return { rejectUnauthorized: false };
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // Password-special URLs can fail URL(); assume managed remote in production.
    if (env.NODE_ENV === "production") {
      return { rejectUnauthorized: false };
    }
    return undefined;
  }

  const host = url.hostname;
  const local = host === "127.0.0.1" || host === "localhost";
  if (local) return undefined;

  const sslmode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  if (sslmode === "disable") return false;
  if (sslmode === "verify-full") {
    return { rejectUnauthorized: true };
  }
  // require / prefer / verify-ca / no-verify / unset → encrypt, relax CA check
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
