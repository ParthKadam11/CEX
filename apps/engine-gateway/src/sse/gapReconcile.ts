import type Redis from "ioredis";
import type { EngineClient } from "../engine/client.js";
import {
  toAppFundingEvent,
  toAppLiquidationEvent,
  toAppOrderEvent,
  toAppOrderSnapshotEvent,
  toAppPositionEvent,
} from "../engine/events.js";
import { log } from "../logger.js";
import type { GatewayMetrics } from "../metrics.js";
import type { FundingHub } from "../redis/funding-hub.js";
import type { LiquidationHub } from "../redis/liquidation-hub.js";
import type { LiveBookHub } from "../redis/live-book.js";
import type { PositionHub } from "../redis/position-hub.js";
import { publishOrderEvent } from "../redis/streams.js";

export type GapReconcileDeps = {
  redis: Redis;
  metrics: GatewayMetrics;
  liveBook: LiveBookHub;
  positions: PositionHub;
  liquidations: LiquidationHub;
  fundings: FundingHub;
};

export type GapReconcileResult = {
  orderEvents: number;
  orderSnapshots: number;
  positions: number;
  liquidations: number;
  fundings: number;
};

// After an SSE ring gap: refresh book and republish retained engine state to OMS.
export async function reconcileSseGap(
  engine: EngineClient,
  deps: GapReconcileDeps,
  afterOrderEventSeq = 0,
): Promise<GapReconcileResult> {
  deps.liveBook.notify(engine.market);

  const snapshot = await engine.reconcile(afterOrderEventSeq);
  const result: GapReconcileResult = {
    orderEvents: 0,
    orderSnapshots: 0,
    positions: 0,
    liquidations: 0,
    fundings: 0,
  };

  for (const event of snapshot.orderEvents) {
    const appEvent = toAppOrderEvent(event);
    if (!appEvent) continue;
    await publishOrderEvent(deps.redis, appEvent);
    deps.metrics.increment("eventsPublished");
    result.orderEvents += 1;
  }

  for (const order of snapshot.orders) {
    const appEvent = toAppOrderSnapshotEvent(order);
    await publishOrderEvent(deps.redis, appEvent);
    deps.metrics.increment("eventsPublished");
    result.orderSnapshots += 1;
  }

  for (const position of snapshot.positions) {
    deps.positions.publish(position);
    await publishOrderEvent(deps.redis, toAppPositionEvent(position));
    deps.metrics.increment("eventsPublished");
    result.positions += 1;
  }

  for (const liquidation of snapshot.liquidations) {
    deps.liquidations.publish(liquidation);
    await publishOrderEvent(deps.redis, toAppLiquidationEvent(liquidation));
    deps.metrics.increment("eventsPublished");
    result.liquidations += 1;
  }

  for (const funding of snapshot.fundings) {
    deps.fundings.publish(funding);
    await publishOrderEvent(deps.redis, toAppFundingEvent(funding));
    deps.metrics.increment("eventsPublished");
    result.fundings += 1;
  }

  log("warn", "SSE gap reconcile published", {
    market: snapshot.market,
    ...result,
    orderEventSeq: snapshot.orderEventSeq,
  });

  return result;
}
