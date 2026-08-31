import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(new URL("../migrations/001_market_data.sql", import.meta.url)),
  "utf8",
);

describe("TimescaleDB market-data schema", () => {
  it("defines the durable tables and one-minute aggregate", () => {
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS timescaledb");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS trade_ticks");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS bbo_snapshots");
    expect(migration).toContain("PRIMARY KEY (market, trade_id)");
    expect(migration).toContain("create_hypertable");
    expect(migration).toContain("candles_1m");
    expect(migration).toContain("add_retention_policy");
  });
});
