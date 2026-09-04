"use client";

import { useEffect, useRef, useState } from "react";
import type { BboMessage, TradeTickMessage } from "@cex/app-contracts";
import type { OrderBookSnapshot } from "@cex/exchange-types";
import { parseEvent } from "@/lib/trading";

const emptyBook: OrderBookSnapshot = {
  market: "SOL-USD",
  bids: [],
  asks: [],
  bbo: { bestBid: null, bestAsk: null },
};

type UseMarketStreamOptions = {
  onTrade?: (trade: TradeTickMessage) => void;
  onBook?: (book: OrderBookSnapshot) => void;
};

export function useMarketStream(options: UseMarketStreamOptions = {}) {
  const [book, setBook] = useState<OrderBookSnapshot>(emptyBook);
  const [connected, setConnected] = useState(false);
  const [lastTrade, setLastTrade] = useState<TradeTickMessage | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let source: EventSource | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function connect() {
      if (closed) return;
      source?.close();
      source = new EventSource("/api/market/stream");

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
        if (!next) return;
        setBook(next);
        optionsRef.current.onBook?.(next);
      });

      source.addEventListener("bbo", (event) => {
        const bbo = parseEvent<BboMessage>(event);
        if (!bbo) return;
        setBook((current) => ({ ...current, bbo }));
      });

      source.addEventListener("trade", (event) => {
        const trade = parseEvent<TradeTickMessage>(event);
        if (!trade) return;
        setLastTrade(trade);
        optionsRef.current.onTrade?.(trade);
      });
    }

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  return { book, setBook, connected, lastTrade };
}
