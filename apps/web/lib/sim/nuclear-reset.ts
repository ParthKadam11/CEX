/**
 * Nuclear local/demo wipe: engine, OMS orders, Timescale history, Redis streams.
 * Not for production.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  engineGatewayHeaders,
  engineGatewayUrl,
  omsHeaders,
  omsUrl,
} from "@/lib/backend";
import {
  refundAllSimMarkets,
  resetSimRuntimeState,
  startSimHeartbeat,
  stopSimHeartbeat,
} from "@/lib/sim/market-maker";

const execFileAsync = promisify(execFile);

export type NuclearResetReport = {
  ok: boolean;
  steps: Record<string, { ok: boolean; detail?: string }>;
};

async function dockerExec(container: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    "docker",
    ["exec", container, ...args],
    { windowsHide: true, maxBuffer: 2_000_000 },
  );
  return `${stdout}${stderr}`.trim();
}

export async function runNuclearReset(): Promise<NuclearResetReport> {
  const steps: NuclearResetReport["steps"] = {};

  // 1) Pause sim so it doesn't immediately re-fill while we wipe.
  try {
    stopSimHeartbeat();
    resetSimRuntimeState();
    steps.sim = { ok: true, detail: "heartbeat stopped + counters reset" };
  } catch (error) {
    steps.sim = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // 2) Exchange hard-reset via gateway (book + balances + WAL).
  try {
    const response = await fetch(`${engineGatewayUrl}/dev/reset`, {
      method: "POST",
      headers: engineGatewayHeaders(),
    });
    const text = await response.text();
    steps.exchange = {
      ok: response.ok,
      detail: text.slice(0, 300),
    };
  } catch (error) {
    steps.exchange = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // 3) OMS Postgres: orders + outbox (keep User accounts; trading balances live in the engine).
  try {
    const sql = `
TRUNCATE TABLE "OrderFill", "Order", "CommandOutbox", "OmsProcessedEvent" CASCADE;
`;
    const out = await dockerExec("infra-postgres-1", [
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ]);
    steps.oms = { ok: true, detail: out.slice(0, 300) || "oms tables truncated" };
  } catch (error) {
    steps.oms = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // 4) Timescale market history + continuous aggregate (candles stick around after TRUNCATE).
  try {
    await dockerExec("infra-timescale-1", [
      "psql",
      "-U",
      "cex",
      "-d",
      "cex_md",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "TRUNCATE TABLE trade_tick_keys, trade_ticks, bbo_snapshots CASCADE;",
    ]);
    await dockerExec("infra-timescale-1", [
      "psql",
      "-U",
      "cex",
      "-d",
      "cex_md",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "DROP MATERIALIZED VIEW IF EXISTS candles_1m CASCADE;",
    ]);
    await dockerExec("infra-timescale-1", [
      "psql",
      "-U",
      "cex",
      "-d",
      "cex_md",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `CREATE MATERIALIZED VIEW candles_1m WITH (timescaledb.continuous) AS SELECT time_bucket(INTERVAL '1 minute', time) AS bucket, market, first(price, time) AS open, max(price) AS high, min(price) AS low, last(price, time) AS close, sum(quantity) AS volume, count(*) AS trades FROM trade_ticks GROUP BY bucket, market WITH NO DATA;`,
    ]);
    await dockerExec("infra-timescale-1", [
      "psql",
      "-U",
      "cex",
      "-d",
      "cex_md",
      "-c",
      `SELECT add_continuous_aggregate_policy('candles_1m', start_offset => INTERVAL '2 hours', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE);`,
    ]);
    steps.timescale = { ok: true, detail: "history + candles wiped" };
  } catch (error) {
    steps.timescale = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // 5) Redis streams + dedupe (avoid FLUSHDB — that kills consumer groups).
  try {
    await dockerExec("infra-redis-1", [
      "redis-cli",
      "DEL",
      "orders:commands",
      "orders:commands:dlq",
      "orders:events",
      "orders:events:dlq",
      "md:events",
      "md:events:dlq",
    ]);
    // Best-effort dedupe wipe via KEYS (fine for local demo).
    const keysOut = await dockerExec("infra-redis-1", [
      "redis-cli",
      "KEYS",
      "engine-gateway:dedupe:*",
    ]);
    const outcomeKeysOut = await dockerExec("infra-redis-1", [
      "redis-cli",
      "KEYS",
      "engine-gateway:outcome:*",
    ]);
    const keys = [...keysOut.split(/\r?\n/), ...outcomeKeysOut.split(/\r?\n/)]
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length > 0) {
      // DEL many keys in chunks — Windows docker arg limits are small.
      for (let i = 0; i < keys.length; i += 100) {
        await dockerExec("infra-redis-1", [
          "redis-cli",
          "DEL",
          ...keys.slice(i, i + 100),
        ]);
      }
    }
    // Recreate consumer groups used by gateway / OMS / ingester.
    // Use "0" so any message written between DEL and CREATE is still readable.
    for (const [stream, group] of [
      ["orders:commands", "xpg"],
      ["orders:events", "oms"],
      ["md:events", "timescale-writer"],
    ] as const) {
      try {
        await dockerExec("infra-redis-1", [
          "redis-cli",
          "XGROUP",
          "CREATE",
          stream,
          group,
          "0",
          "MKSTREAM",
        ]);
      } catch {
        // BUSYGROUP = already exists
      }
    }
    steps.redis = {
      ok: true,
      detail: `streams cleared · dedupe keys ${keys.length}`,
    };
  } catch (error) {
    steps.redis = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // 6) Best-effort: ping OMS health so caller knows stack is up.
  try {
    const response = await fetch(`${omsUrl}/health`, {
      headers: omsHeaders(),
    });
    steps.omsHealth = {
      ok: response.ok,
      detail: `status ${response.status}`,
    };
  } catch (error) {
    steps.omsHealth = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // 7) Re-credit MM accounts before the heartbeat starts placing again.
  try {
    const funded = await refundAllSimMarkets();
    steps.simFund = {
      ok: funded.ok,
      detail: JSON.stringify(funded.markets),
    };
  } catch (error) {
    steps.simFund = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // Restart ambient MM so the market can reseed empty → ladder.
  try {
    if (process.env.SIM_HEARTBEAT !== "false") {
      startSimHeartbeat();
      steps.simRestart = { ok: true, detail: "heartbeat restarted" };
    } else {
      steps.simRestart = { ok: true, detail: "SIM_HEARTBEAT=false — left stopped" };
    }
  } catch (error) {
    steps.simRestart = {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const ok = Object.values(steps).every((step) => step.ok);
  return { ok, steps };
}
