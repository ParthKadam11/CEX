"use client";

import { useEffect, useRef, useState } from "react";
import type { BboMessage, TradeTickMessage } from "@cex/app-contracts";
import type {
  FundingEvent,
  LiquidationEvent,
  MarketSymbol,
  OrderBookSnapshot,
  Position,
} from "@cex/exchange-types";
import { parseEvent } from "@/lib/trading";

function emptyBook(market: MarketSymbol): OrderBookSnapshot {
  return {
    market,
    bids: [],
    asks: [],
    bbo: { bestBid: null, bestAsk: null },
  };
}

/** Client-only stream callbacks (kept off the hook args object for RSC lint). */
export type MarketStreamHandlers = {
  onTrade?: (trade: TradeTickMessage) => void;
  onBook?: (book: OrderBookSnapshot) => void;
  onPosition?: (position: Position) => void;
  onLiquidation?: (liquidation: LiquidationEvent) => void;
  onFunding?: (funding: FundingEvent) => void;
};

/** Production (and opt-in) must EventSource the gateway directly — never Vercel BFF SSE. */
function requireDirectSse(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_REQUIRE_DIRECT_SSE === "true"
  );
}

export function useMarketStream(
  market: MarketSymbol,
  handlers: MarketStreamHandlers = {},
) {
  const [book, setBook] = useState<OrderBookSnapshot>(() => emptyBook(market));
  const [connected, setConnected] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastTrade, setLastTrade] = useState<TradeTickMessage | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    setBook(emptyBook(market));
    setLastTrade(null);
    setConnected(false);
    setStreamError(null);

    let source: EventSource | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const directOnly = requireDirectSse();

    async function resolveStreamUrl(): Promise<string> {
      const qs = new URLSearchParams({ market });
      try {
        const response = await fetch(`/api/market/stream-ticket?${qs}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`STREAM_TICKET_FAILED:${response.status}`);
        }
        const body = (await response.json()) as { url?: string };
        if (typeof body.url !== "string" || body.url.length === 0) {
          throw new Error("STREAM_TICKET_MISSING_URL");
        }
        if (directOnly && !/^https?:\/\//i.test(body.url)) {
          throw new Error("STREAM_REQUIRES_DIRECT_GATEWAY");
        }
        return body.url;
      } catch (error) {
        if (directOnly) throw error;
        // Local/dev only: fall back to same-origin BFF proxy.
        return `/api/market/stream?${qs}`;
      }
    }

    async function connect() {
      if (closed) return;
      source?.close();

      let url: string;
      try {
        url = await resolveStreamUrl();
        setStreamError(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "STREAM_UNAVAILABLE";
        console.error("[useMarketStream] direct SSE unavailable", error);
        setConnected(false);
        setStreamError(message);
        scheduleRetry();
        return;
      }
      if (closed) return;

      source = new EventSource(url);

      source.onopen = () => {
        attempt = 0;
        setConnected(true);
        setStreamError(null);
      };
      source.onerror = () => {
        setConnected(false);
        if (directOnly) {
          setStreamError("STREAM_GATEWAY_DISCONNECTED");
        }
        source?.close();
        scheduleRetry();
      };

      source.addEventListener("book", (event) => {
        const next = parseEvent<OrderBookSnapshot>(event);
        if (!next || next.market !== market) return;
        setBook(next);
        handlersRef.current.onBook?.(next);
      });

      source.addEventListener("bbo", (event) => {
        const bbo = parseEvent<BboMessage>(event);
        if (!bbo || bbo.market !== market) return;
        setBook((current) => ({ ...current, bbo }));
      });

      source.addEventListener("trade", (event) => {
        const trade = parseEvent<TradeTickMessage>(event);
        if (!trade || trade.market !== market) return;
        setLastTrade(trade);
        handlersRef.current.onTrade?.(trade);
      });

      source.addEventListener("position", (event) => {
        const position = parseEvent<Position>(event);
        if (!position || position.market !== market) return;
        handlersRef.current.onPosition?.(position);
      });

      source.addEventListener("liquidation", (event) => {
        const liquidation = parseEvent<LiquidationEvent>(event);
        if (!liquidation || liquidation.market !== market) return;
        handlersRef.current.onLiquidation?.(liquidation);
      });

      source.addEventListener("funding", (event) => {
        const funding = parseEvent<FundingEvent>(event);
        if (!funding || funding.market !== market) return;
        handlersRef.current.onFunding?.(funding);
      });
    }

    function scheduleRetry() {
      if (closed) return;
      const delay = Math.min(8_000, 500 * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(() => {
        void connect();
      }, delay);
    }

    void connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [market]);

  return { book, setBook, connected, lastTrade, streamError };
}
