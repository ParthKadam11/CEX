import type {
  AssetId,
  ExchangeStreamEvent,
  FundingEvent,
  LiquidationEvent,
  MarketSymbol,
  OrderEvent,
  Position,
  Trade,
} from "@cex/exchange-types";
import {
  isIdentifier,
  isMarketSymbol,
  isSafePositiveInteger,
  isTimestamp,
} from "@cex/exchange-types";
import { log } from "../logger.js";

export type EngineSseReady = {
  kind: "ready";
  market: MarketSymbol;
  userId: string | null;
  streamSeq: number;
  oldestSeq: number | null;
  gap: boolean;
};

export type EngineSseGap = {
  kind: "gap";
  market: MarketSymbol;
  afterSeq: number;
  oldestSeq: number | null;
  latestSeq: number;
};

export type EngineSseEvent =
  | ExchangeStreamEvent
  | EngineSseReady
  | EngineSseGap;

type EventHandler = (event: EngineSseEvent) => void | Promise<void>;
type SseOptions = {
  onConnectionChange?: (connected: boolean) => void;
  onReconnect?: () => void;
  headers?: Record<string, string>;
};

type UrlFactory = (afterSeq: number | null) => string;

// Reads the exchange SSE stream and reconnects after disconnects.
// Tracks streamSeq and requests catch-up via ?afterSeq= on reconnect.

export class EngineSseClient {
  private abortController: AbortController | null = null;
  private stopped = true;
  private running = false;
  private lastStreamSeq: number | null = null;

  constructor(
    private readonly urlFor: UrlFactory | string,
    private readonly onEvent: EventHandler,
    private readonly options: SseOptions = {},
  ) {}

  get cursor(): number | null {
    return this.lastStreamSeq;
  }

  start(): void {
    if (this.running) return;
    this.stopped = false;
    this.running = true;
    void this.run().finally(() => {
      this.running = false;
    });
  }

  stop(): void {
    this.stopped = true;
    this.abortController?.abort();
  }

  private resolveUrl(): string {
    if (typeof this.urlFor === "string") {
      const afterSeq = this.lastStreamSeq;
      if (afterSeq == null) return this.urlFor;
      const join = this.urlFor.includes("?") ? "&" : "?";
      return `${this.urlFor}${join}afterSeq=${afterSeq}`;
    }
    return this.urlFor(this.lastStreamSeq);
  }

  private async run(): Promise<void> {
    let delayMs = 500;

    while (!this.stopped) {
      try {
        await this.connectOnce();
        delayMs = 500;
      } catch (error) {
        if (this.stopped) return;

        log("warn", "SSE disconnected", {
          error: error instanceof Error ? error.message : String(error),
          afterSeq: this.lastStreamSeq,
        });
        this.options.onReconnect?.();
        await sleep(delayMs);
        delayMs = Math.min(delayMs * 2, 10_000);
      }
    }
  }

  private async connectOnce(): Promise<void> {
    const controller = new AbortController();
    this.abortController = controller;
    const url = this.resolveUrl();

    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/event-stream",
          ...(this.lastStreamSeq != null
            ? { "Last-Event-ID": String(this.lastStreamSeq) }
            : {}),
          ...this.options.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE connect failed: ${response.status}`);
      }

      this.options.onConnectionChange?.(true);
      log("info", "SSE connected", {
        url,
        afterSeq: this.lastStreamSeq,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";
      let eventId: string | null = null;
      let dataLines: string[] = [];

      while (!this.stopped) {
        const { done, value } = await reader.read();
        if (done) throw new Error("SSE stream ended");

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const newline = buffer.indexOf("\n");
          if (newline === -1) break;

          let line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);

          if (line === "") {
            if (dataLines.length > 0) {
              const data = dataLines.join("\n");
              dataLines = [];
              const currentEventName = eventName;
              const currentId = eventId;
              eventName = "message";
              eventId = null;
              await this.dispatch(currentEventName, data, currentId);
            }
            continue;
          }

          if (line.startsWith(":")) continue;

          if (line.startsWith("event:")) {
            eventName = line.slice("event:".length).trim();
            continue;
          }

          if (line.startsWith("id:")) {
            eventId = line.slice("id:".length).trim();
            continue;
          }

          if (line.startsWith("data:")) {
            dataLines.push(line.slice("data:".length).trimStart());
          }
        }
      }
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
      }
      this.options.onConnectionChange?.(false);
    }
  }

  private async dispatch(
    eventName: string,
    rawData: string,
    eventId: string | null,
  ): Promise<void> {
    try {
      const data: unknown = JSON.parse(rawData);

      if (eventName === "ready") {
        const ready = parseReady(data);
        if (ready) await this.onEvent(ready);
        return;
      }

      if (eventName === "gap") {
        const gap = parseGap(data);
        if (gap) await this.onEvent(gap);
        return;
      }

      const event = parseExchangeEvent(data);
      if (!event) {
        log("warn", "ignored invalid SSE event", { eventName });
        return;
      }

      if (eventName !== "message" && eventName !== event.kind) {
        log("warn", "SSE event name does not match payload", { eventName });
        return;
      }

      const seqFromId = eventId != null ? Number(eventId) : null;
      if (
        seqFromId != null &&
        Number.isSafeInteger(seqFromId) &&
        seqFromId !== event.streamSeq
      ) {
        log("warn", "SSE id does not match streamSeq", {
          eventId,
          streamSeq: event.streamSeq,
        });
      }

      this.lastStreamSeq = event.streamSeq;
      await this.onEvent(event);
    } catch (error) {
      log("warn", "invalid SSE event data", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function parseReady(value: unknown): EngineSseReady | null {
  if (!isRecord(value) || !isMarketSymbol(value.market)) return null;

  const userId = value.userId;
  if (userId !== null && typeof userId !== "string") return null;

  const streamSeq =
    typeof value.streamSeq === "number" && Number.isSafeInteger(value.streamSeq)
      ? value.streamSeq
      : 0;
  const oldestSeq =
    value.oldestSeq === null
      ? null
      : typeof value.oldestSeq === "number" &&
          Number.isSafeInteger(value.oldestSeq)
        ? value.oldestSeq
        : null;
  const gap = value.gap === true;

  return {
    kind: "ready",
    market: value.market,
    userId,
    streamSeq,
    oldestSeq,
    gap,
  };
}

function parseGap(value: unknown): EngineSseGap | null {
  if (!isRecord(value) || !isMarketSymbol(value.market)) return null;
  if (
    typeof value.afterSeq !== "number" ||
    !Number.isSafeInteger(value.afterSeq) ||
    typeof value.latestSeq !== "number" ||
    !Number.isSafeInteger(value.latestSeq)
  ) {
    return null;
  }
  const oldestSeq =
    value.oldestSeq === null
      ? null
      : typeof value.oldestSeq === "number" &&
          Number.isSafeInteger(value.oldestSeq)
        ? value.oldestSeq
        : null;
  return {
    kind: "gap",
    market: value.market,
    afterSeq: value.afterSeq,
    oldestSeq,
    latestSeq: value.latestSeq,
  };
}

function parseExchangeEvent(value: unknown): ExchangeStreamEvent | null {
  if (!isRecord(value) || !isMarketSymbol(value.market)) return null;
  if (
    typeof value.streamSeq !== "number" ||
    !Number.isSafeInteger(value.streamSeq) ||
    value.streamSeq <= 0
  ) {
    return null;
  }

  switch (value.kind) {
    case "ORDER":
      return isOrderEvent(value.event)
        ? {
            kind: "ORDER",
            market: value.market,
            event: value.event,
            streamSeq: value.streamSeq,
          }
        : null;
    case "BBO":
      return isNullableNumber(value.bestBid) &&
        isNullableNumber(value.bestAsk) &&
        isSafePositiveInteger(value.engineSequence) &&
        isTimestamp(value.timestamp)
        ? {
            kind: "BBO",
            market: value.market,
            bestBid: value.bestBid,
            bestAsk: value.bestAsk,
            engineSequence: value.engineSequence,
            timestamp: value.timestamp,
            streamSeq: value.streamSeq,
          }
        : null;
    case "CREDIT":
      return typeof value.userId === "string" &&
        isAssetId(value.asset) &&
        typeof value.amount === "number"
        ? {
            kind: "CREDIT",
            market: value.market,
            userId: value.userId,
            asset: value.asset,
            amount: value.amount,
            streamSeq: value.streamSeq,
          }
        : null;
    case "DEBIT":
      return typeof value.userId === "string" &&
        isAssetId(value.asset) &&
        typeof value.amount === "number"
        ? {
            kind: "DEBIT",
            market: value.market,
            userId: value.userId,
            asset: value.asset,
            amount: value.amount,
            streamSeq: value.streamSeq,
          }
        : null;
    case "TRADE":
      return isTrade(value.trade)
        ? {
            kind: "TRADE",
            market: value.market,
            trade: value.trade,
            streamSeq: value.streamSeq,
          }
        : null;
    case "POSITION":
      return isPosition(value.position)
        ? {
            kind: "POSITION",
            market: value.market,
            position: value.position,
            streamSeq: value.streamSeq,
          }
        : null;
    case "LIQUIDATION":
      return isLiquidation(value.liquidation)
        ? {
            kind: "LIQUIDATION",
            market: value.market,
            liquidation: value.liquidation,
            streamSeq: value.streamSeq,
          }
        : null;
    case "FUNDING":
      return isFunding(value.funding)
        ? {
            kind: "FUNDING",
            market: value.market,
            funding: value.funding,
            streamSeq: value.streamSeq,
          }
        : null;
    default:
      return null;
  }
}

function isTrade(value: unknown): value is Trade {
  return (
    isRecord(value) &&
    isIdentifier(value.tradeId) &&
    isSafePositiveInteger(value.engineSequence) &&
    isMarketSymbol(value.market) &&
    isSafePositiveInteger(value.price) &&
    isSafePositiveInteger(value.quantity) &&
    isIdentifier(value.buyOrderId) &&
    isIdentifier(value.sellOrderId) &&
    isIdentifier(value.buyerUserId) &&
    isIdentifier(value.sellerUserId) &&
    isTimestamp(value.timestamp)
  );
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    isIdentifier(value.userId) &&
    isMarketSymbol(value.market) &&
    typeof value.size === "number" &&
    Number.isSafeInteger(value.size) &&
    (value.entryPrice === 0 || isSafePositiveInteger(value.entryPrice)) &&
    typeof value.margin === "number" &&
    Number.isSafeInteger(value.margin) &&
    value.margin >= 0 &&
    isSafePositiveInteger(value.leverage) &&
    typeof value.updatedAt === "number"
  );
}

function isLiquidation(value: unknown): value is LiquidationEvent {
  return (
    isRecord(value) &&
    isIdentifier(value.userId) &&
    isMarketSymbol(value.market) &&
    typeof value.size === "number" &&
    Number.isSafeInteger(value.size) &&
    value.size !== 0 &&
    isSafePositiveInteger(value.entryPrice) &&
    isSafePositiveInteger(value.mark) &&
    typeof value.realizedPnl === "number" &&
    Number.isSafeInteger(value.realizedPnl) &&
    typeof value.marginReleased === "number" &&
    Number.isSafeInteger(value.marginReleased) &&
    value.marginReleased >= 0 &&
    value.reason === "MAINTENANCE_MARGIN" &&
    isIdentifier(value.counterpartyUserId) &&
    isTimestamp(value.timestamp)
  );
}

function isFunding(value: unknown): value is FundingEvent {
  return (
    isRecord(value) &&
    isIdentifier(value.userId) &&
    isMarketSymbol(value.market) &&
    typeof value.size === "number" &&
    Number.isSafeInteger(value.size) &&
    value.size !== 0 &&
    isSafePositiveInteger(value.mark) &&
    typeof value.fundingRateBps === "number" &&
    Number.isSafeInteger(value.fundingRateBps) &&
    typeof value.payment === "number" &&
    Number.isSafeInteger(value.payment) &&
    isTimestamp(value.timestamp)
  );
}

function isOrderEvent(value: unknown): value is OrderEvent {
  return (
    isRecord(value) &&
    typeof value.seq === "number" &&
    typeof value.type === "string" &&
    typeof value.orderId === "string" &&
    typeof value.userId === "string" &&
    isMarketSymbol(value.market) &&
    typeof value.timestamp === "number"
  );
}

function isAssetId(value: unknown): value is AssetId {
  return value === "SOL" || value === "USD";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
