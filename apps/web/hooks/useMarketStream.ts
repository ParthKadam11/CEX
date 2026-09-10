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

type UseMarketStreamOptions = {
  market: MarketSymbol;
  onTrade?: (trade: TradeTickMessage) => void;
  onBook?: (book: OrderBookSnapshot) => void;
  onPosition?: (position: Position) => void;
  onLiquidation?: (liquidation: LiquidationEvent) => void;
  onFunding?: (funding: FundingEvent) => void;
};

export function useMarketStream(options: UseMarketStreamOptions) {
  const [book, setBook] = useState<OrderBookSnapshot>(() =>
    emptyBook(options.market),
  );
  const [connected, setConnected] = useState(false);
  const [lastTrade, setLastTrade] = useState<TradeTickMessage | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    setBook(emptyBook(options.market));
    setLastTrade(null);
    setConnected(false);

    let source: EventSource | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    async function resolveStreamUrl(): Promise<string> {
      const qs = new URLSearchParams({ market: options.market });
      try {
        const response = await fetch(`/api/market/stream-ticket?${qs}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const body = (await response.json()) as { url?: string };
          if (typeof body.url === "string" && body.url.length > 0) {
            return body.url;
          }
        }
      } catch {
        // fall through to same-origin BFF proxy
      }
      return `/api/market/stream?${qs}`;
    }

    async function connect() {
      if (closed) return;
      source?.close();

      let url: string;
      try {
        url = await resolveStreamUrl();
      } catch {
        scheduleRetry();
        return;
      }
      if (closed) return;

      source = new EventSource(url);

      source.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      source.onerror = () => {
        setConnected(false);
        source?.close();
        scheduleRetry();
      };

      source.addEventListener("book", (event) => {
        const next = parseEvent<OrderBookSnapshot>(event);
        if (!next || next.market !== optionsRef.current.market) return;
        setBook(next);
        optionsRef.current.onBook?.(next);
      });

      source.addEventListener("bbo", (event) => {
        const bbo = parseEvent<BboMessage>(event);
        if (!bbo || bbo.market !== optionsRef.current.market) return;
        setBook((current) => ({ ...current, bbo }));
      });

      source.addEventListener("trade", (event) => {
        const trade = parseEvent<TradeTickMessage>(event);
        if (!trade || trade.market !== optionsRef.current.market) return;
        setLastTrade(trade);
        optionsRef.current.onTrade?.(trade);
      });

      source.addEventListener("position", (event) => {
        const position = parseEvent<Position>(event);
        if (!position || position.market !== optionsRef.current.market) return;
        optionsRef.current.onPosition?.(position);
      });

      source.addEventListener("liquidation", (event) => {
        const liquidation = parseEvent<LiquidationEvent>(event);
        if (
          !liquidation ||
          liquidation.market !== optionsRef.current.market
        ) {
          return;
        }
        optionsRef.current.onLiquidation?.(liquidation);
      });

      source.addEventListener("funding", (event) => {
        const funding = parseEvent<FundingEvent>(event);
        if (!funding || funding.market !== optionsRef.current.market) {
          return;
        }
        optionsRef.current.onFunding?.(funding);
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
  }, [options.market]);

  return { book, setBook, connected, lastTrade };
}
