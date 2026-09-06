import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Side } from "@cex/exchange-types";
import { MarketRuntime } from "../../src/market/runtime.js";
import { makeOrder } from "../helpers.js";

function tempWalPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cex-fund-wal-"));
  return path.join(dir, "SOL-USD-PERP.jsonl");
}

const noTimer = { fundingIntervalMs: 0 };

describe("perp funding via WAL", () => {
  it("settles funding, persists FUNDING, and restores balances on replay", async () => {
    const file = tempWalPath();
    const live = MarketRuntime.open("SOL-USD-PERP", file, undefined, noTimer);

    await live.credit("long", "USD", 5_000);
    await live.credit("short", "USD", 5_000);

    await live.place(
      makeOrder({
        orderId: "s-open",
        userId: "short",
        market: "SOL-USD-PERP",
        side: Side.SELL,
        price: 100,
        quantity: 1,
        leverage: 5,
      }),
    );
    await live.place(
      makeOrder({
        orderId: "b-open",
        userId: "long",
        market: "SOL-USD-PERP",
        side: Side.BUY,
        price: 100,
        quantity: 1,
        leverage: 5,
      }),
    );

    const longBefore = live.balances.get("long", "USD").available;
    const shortBefore = live.balances.get("short", "USD").available;

    const payments = await live.settleFunding();
    expect(payments.length).toBeGreaterThanOrEqual(2);
    // Default market rate 100 bps → ±1 USD on 1 lot @ mark 100
    expect(live.balances.get("long", "USD").available).toBe(longBefore - 1);
    expect(live.balances.get("short", "USD").available).toBe(shortBefore + 1);

    const wal = fs.readFileSync(file, "utf8");
    expect(wal).toContain('"type":"FUNDING"');

    await live.close();

    const restarted = MarketRuntime.open(
      "SOL-USD-PERP",
      file,
      undefined,
      noTimer,
    );
    expect(restarted.balances.get("long", "USD").available).toBe(
      longBefore - 1,
    );
    expect(restarted.balances.get("short", "USD").available).toBe(
      shortBefore + 1,
    );
    await restarted.close();
  });
});
