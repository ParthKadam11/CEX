"use client";

import { useEffect, useState } from "react";
import { CandleChart } from "@/components/CandleChart";
import { useMarketStream } from "@/hooks/useMarketStream";
import {
  formatTime,
  type Candle,
  type HistoryTrade,
  type MarketMeta,
} from "@/lib/trading";

type BboSnapshot = {
  time: string;
  bestBid: number | null;
  bestAsk: number | null;
  engineSequence: number;
};

export function MarketExplorer() {
  const { book, connected, lastTrade } = useMarketStream();
  const [meta, setMeta] = useState<MarketMeta | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [trades, setTrades] = useState<HistoryTrade[]>([]);
  const [bboHistory, setBboHistory] = useState<BboSnapshot[]>([]);
  const [tab, setTab] = useState<"trades" | "bbo">("trades");

  useEffect(() => {
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!lastTrade) return;
    void loadHistory();
  }, [lastTrade]);

  async function loadHistory() {
    const [metaRes, candlesRes, tradesRes, bboRes] = await Promise.all([
      fetch("/api/market", { cache: "no-store" }),
      fetch("/api/market/history/candles?limit=60", { cache: "no-store" }),
      fetch("/api/market/history/trades?limit=40", { cache: "no-store" }),
      fetch("/api/market/history/bbo?limit=40", { cache: "no-store" }),
    ]);

    if (metaRes.ok) setMeta((await metaRes.json()) as MarketMeta);
    if (candlesRes.ok) {
      const body = (await candlesRes.json()) as { candles?: Candle[] };
      setCandles(Array.isArray(body.candles) ? body.candles : []);
    }
    if (tradesRes.ok) {
      const body = (await tradesRes.json()) as { trades?: HistoryTrade[] };
      setTrades(Array.isArray(body.trades) ? body.trades : []);
    }
    if (bboRes.ok) {
      const body = (await bboRes.json()) as { snapshots?: BboSnapshot[] };
      setBboHistory(Array.isArray(body.snapshots) ? body.snapshots : []);
    }
  }

  return (
    <div className="animate-fade-up w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-sm text-zinc-500">Market data</p>
          <h1 className="font-display text-3xl tracking-tight text-zinc-950">
            {meta?.market ?? "SOL-USD"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <MetaChip label="Status" value={meta?.status ?? "OPEN"} />
          <MetaChip label="Tick" value={meta?.tickSize ?? 1} />
          <MetaChip label="Lot" value={meta?.lotSize ?? 1} />
          <MetaChip label="Bid" value={book.bbo.bestBid ?? "—"} tone="bid" />
          <MetaChip label="Ask" value={book.bbo.bestAsk ?? "—"} tone="ask" />
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              connected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {connected ? "Live" : "Connecting"}
          </span>
        </div>
      </div>

      <section className="rounded-lg border border-zinc-200 p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-950">
          Candles (1m)
        </h2>
        <CandleChart candles={candles} />
      </section>

      <section className="rounded-lg border border-zinc-200 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950">Live book</h2>
          <span className="text-xs text-zinc-400">
            {book.bids.length} bids · {book.asks.length} asks
          </span>
        </div>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="mb-2 flex justify-between text-xs text-zinc-400">
              <span>Bids</span>
              <span>Qty</span>
            </div>
            {book.bids.slice(0, 10).map((level) => (
              <div key={level.price} className="flex justify-between py-0.5">
                <span className="text-emerald-600">{level.price}</span>
                <span className="text-zinc-600">{level.quantity}</span>
              </div>
            ))}
            {book.bids.length === 0 && <p className="text-zinc-300">Empty</p>}
          </div>
          <div>
            <div className="mb-2 flex justify-between text-xs text-zinc-400">
              <span>Asks</span>
              <span>Qty</span>
            </div>
            {[...book.asks]
              .reverse()
              .slice(0, 10)
              .map((level) => (
                <div key={level.price} className="flex justify-between py-0.5">
                  <span className="text-red-600">{level.price}</span>
                  <span className="text-zinc-600">{level.quantity}</span>
                </div>
              ))}
            {book.asks.length === 0 && <p className="text-zinc-300">Empty</p>}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950">History</h2>
          <div className="flex rounded-md border border-zinc-200 p-0.5 text-xs">
            {(["trades", "bbo"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTab(option)}
                className={`rounded px-2.5 py-1 font-medium uppercase ${
                  tab === option
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-500 hover:text-zinc-950"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {tab === "trades" ? (
          trades.length === 0 ? (
            <Empty>No durable trades yet.</Empty>
          ) : (
            <div className="divide-y divide-zinc-100 text-sm">
              {trades.map((trade) => (
                <div
                  key={trade.tradeId}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <span className="font-medium text-zinc-950">
                    {trade.quantity} @ {trade.price}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {formatTime(trade.time)}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : bboHistory.length === 0 ? (
          <Empty>No BBO snapshots yet.</Empty>
        ) : (
          <div className="divide-y divide-zinc-100 text-sm">
            {bboHistory.map((row) => (
              <div
                key={`${row.time}-${row.engineSequence}`}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <span>
                  <span className="text-emerald-600">{row.bestBid ?? "—"}</span>
                  {" / "}
                  <span className="text-red-600">{row.bestAsk ?? "—"}</span>
                </span>
                <span className="text-xs text-zinc-400">
                  {formatTime(row.time)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetaChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "bid" | "ask";
}) {
  return (
    <div className="text-right">
      <p className="text-xs text-zinc-400">{label}</p>
      <p
        className={`font-semibold ${
          tone === "bid"
            ? "text-emerald-600"
            : tone === "ask"
              ? "text-red-600"
              : "text-zinc-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-zinc-400">{children}</p>
  );
}
