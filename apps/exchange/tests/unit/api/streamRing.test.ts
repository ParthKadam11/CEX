import { describe, expect, it } from "vitest";
import { StreamRing } from "../../../src/api/streamRing.js";
import { EventBus } from "../../../src/api/eventBus.js";

describe("StreamRing", () => {
  it("assigns monotonic streamSeq and supports readAfter", () => {
    const ring = new StreamRing(8);
    const a = ring.push({
      kind: "CREDIT",
      market: "SOL-USD",
      userId: "u1",
      asset: "USD",
      amount: 1,
    });
    const b = ring.push({
      kind: "CREDIT",
      market: "SOL-USD",
      userId: "u1",
      asset: "USD",
      amount: 2,
    });
    expect(a.streamSeq).toBe(1);
    expect(b.streamSeq).toBe(2);

    const catchUp = ring.readAfter(1);
    expect(catchUp.gap).toBe(false);
    expect(catchUp.events.map((e) => e.streamSeq)).toEqual([2]);
  });

  it("flags a gap when afterSeq is older than the ring", () => {
    const ring = new StreamRing(2);
    ring.push({
      kind: "CREDIT",
      market: "SOL-USD",
      userId: "u1",
      asset: "USD",
      amount: 1,
    });
    ring.push({
      kind: "CREDIT",
      market: "SOL-USD",
      userId: "u1",
      asset: "USD",
      amount: 2,
    });
    ring.push({
      kind: "CREDIT",
      market: "SOL-USD",
      userId: "u1",
      asset: "USD",
      amount: 3,
    });

    // Capacity 2 → seq 1 evicted; oldest is 2.
    expect(ring.oldestSeq).toBe(2);
    const catchUp = ring.readAfter(0);
    expect(catchUp.gap).toBe(true);
    expect(catchUp.events.map((e) => e.streamSeq)).toEqual([2, 3]);
  });
});

describe("EventBus catch-up", () => {
  it("publishes sequenced events into the ring", () => {
    const bus = new EventBus(16);
    const seen: number[] = [];
    bus.subscribe((event) => seen.push(event.streamSeq));

    bus.publish({
      kind: "CREDIT",
      market: "SOL-USD",
      userId: "u1",
      asset: "USD",
      amount: 10,
    });
    bus.publish({
      kind: "CREDIT",
      market: "SOL-USD",
      userId: "u1",
      asset: "USD",
      amount: 20,
    });

    expect(seen).toEqual([1, 2]);
    expect(bus.catchUp(1).events).toHaveLength(1);
    expect(bus.catchUp(1).events[0]?.streamSeq).toBe(2);
  });
});
