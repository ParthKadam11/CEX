"use client";

import { useEffect, useRef, useState } from "react";
import type { BboMessage, TradeTickMessage } from "@cex/app-contracts";
import type { MarketSymbol, OrderBookSnapshot, Position } from "@cex/exchange-types";
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

    function connect() {
      if (closed) return;
      source?.close();
      const qs = new URLSearchParams({ market: options.market });
      source = new EventSource(`/api/market/stream?${qs}`);

      source.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      source.onerror = () => {
        setConnected(false);
        source?.close();
        const delay = Math.min(8_000, 500 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
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
    }

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [options.market]);

  return { book, setBook, connected, lastTrade };
}
