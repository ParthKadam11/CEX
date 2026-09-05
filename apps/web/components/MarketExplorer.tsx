"use client";

import { useEffect, useMemo, useState } from "react";
import type { TradeTickMessage } from "@cex/app-contracts";
import { CandleChart } from "@/components/CandleChart";
import { useMarketStream } from "@/hooks/useMarketStream";
import {
  buildLiveCandles,
  formatTime,
  normalizeCandle,
  type Candle,
  type HistoryTrade,
  type LiveTapeTrade,
  type MarketMeta,
} from "@/lib/trading";

type BboSnapshot = {
  time: string;
  bestBid: number | null;
  bestAsk: number | null;
  engineSequence: number;
};

const HISTORY_PAGE = 20;

export function MarketExplorer() {
  const [meta, setMeta] = useState<MarketMeta | null>(null);
  const [historyCandles, setHistoryCandles] = useState<Candle[]>([]);
  const [trades, setTrades] = useState<HistoryTrade[]>([]);
  const [bboHistory, setBboHistory] = useState<BboSnapshot[]>([]);
  const [tape, setTape] = useState<LiveTapeTrade[]>([]);
  const [historyTab, setHistoryTab] = useState<"trades" | "bbo">("trades");
  const [historyPage, setHistoryPage] = useState(0);

  const { book, connected, lastTrade } = useMarketStream({
    onTrade: (trade: TradeTickMessage) => {
      setTape((current) =>
        [
          {
            id: trade.tradeId,
            price: Number(trade.price),
            quantity: Number(trade.quantity),
            at: Date.now(),
          },
          ...current.filter((row) => row.id !== trade.tradeId),
        ].slice(0, 120),
      );
      void loadHistory();
    },
  });

  const liveCandles = useMemo(
    () => buildLiveCandles(tape, 5_000, 90),
    [tape],
  );
  const chartCandles =
    liveCandles.length > 0 ? liveCandles : historyCandles;
  const chartInterval = liveCandles.length > 0 ? "5s live" : "1m history";

  useEffect(() => {
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!lastTrade) return;
    setTape((current) => {
      if (current.some((row) => row.id === lastTrade.tradeId)) return current;
      return [
        {
          id: lastTrade.tradeId,
          price: Number(lastTrade.price),
          quantity: Number(lastTrade.quantity),
          at: Date.now(),
        },
        ...current,
      ].slice(0, 120);
    });
  }, [lastTrade]);

  async function loadHistory() {
    const [metaRes, candlesRes, tradesRes, bboRes] = await Promise.all([
      fetch("/api/market", { cache: "no-store" }),
      fetch("/api/market/history/candles?limit=60", { cache: "no-store" }),
      fetch("/api/market/history/trades?limit=100", { cache: "no-store" }),
      fetch("/api/market/history/bbo?limit=100", { cache: "no-store" }),
    ]);

    if (metaRes.ok) setMeta((await metaRes.json()) as MarketMeta);
    if (candlesRes.ok) {
      const body = (await candlesRes.json()) as { candles?: Candle[] };
      setHistoryCandles(
        Array.isArray(body.candles)
          ? body.candles.map((c) => normalizeCandle(c))
          : [],
      );
    }
    if (tradesRes.ok) {
      const body = (await tradesRes.json()) as { trades?: HistoryTrade[] };
      const next = Array.isArray(body.trades) ? body.trades : [];
      setTrades(next);
      setTape((current) => {
        if (current.length > 0) return current;
        return next.map((trade) => ({
          id: trade.tradeId,
          price: Number(trade.price),
          quantity: Number(trade.quantity),
          at: new Date(trade.time).getTime(),
        }));
      });
    }
    if (bboRes.ok) {
      const body = (await bboRes.json()) as { snapshots?: BboSnapshot[] };
      setBboHistory(Array.isArray(body.snapshots) ? body.snapshots : []);
    }
  }

  // Bids: best (highest) first — descending price
  const bids = useMemo(
    () =>
      [...book.bids].sort(
        (a, b) => Number(b.price) - Number(a.price),
      ),
    [book.bids],
  );
  // Asks: best (lowest) first — ascending price
  const asks = useMemo(
    () =>
      [...book.asks].sort(
        (a, b) => Number(a.price) - Number(b.price),
      ),
    [book.asks],
  );

  const historyRows = historyTab === "trades" ? trades : bboHistory;
  const historyPageCount = Math.max(
    1,
    Math.ceil(historyRows.length / HISTORY_PAGE),
  );
  const safeHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const historySlice = historyRows.slice(
    safeHistoryPage * HISTORY_PAGE,
    safeHistoryPage * HISTORY_PAGE + HISTORY_PAGE,
  );

  return (
    <div className="animate-fade-up w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Market data</p>
          <h1 className="font-display text-3xl tracking-tight text-zinc-950 dark:text-zinc-50">
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
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {connected ? "Live" : "Connecting"}
          </span>
        </div>
      </div>

      <div className="grid h-[min(560px,70vh)] min-h-[420px] gap-3 overflow-hidden lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.85fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Chart
            </h2>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {chartInterval} · zoom / pan on chart
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <CandleChart
              candles={chartCandles}
              intervalLabel={chartInterval}
              className="h-full"
            />
          </div>
        </section>

        {/* Live book — all levels, no trades tab */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Live book
            </h2>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {bids.length} bids · {asks.length} asks
            </span>
          </div>
          <p className="mb-3 shrink-0 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
            Resting limit orders on the engine.{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              Bids
            </span>{" "}
            = buy interest, listed{" "}
            <strong className="font-medium text-zinc-600 dark:text-zinc-300">
              descending
            </strong>{" "}
            (highest / best bid first).{" "}
            <span className="text-red-600 dark:text-red-400">Asks</span> = sell
            interest, listed{" "}
            <strong className="font-medium text-zinc-600 dark:text-zinc-300">
              ascending
            </strong>{" "}
            (lowest / best ask first).
          </p>

          <div className="grid min-h-0 flex-1 grid-cols-2 gap-6 overflow-hidden text-sm">
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="mb-1.5 flex shrink-0 items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Bids
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    Price ↓ descending
                  </p>
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Qty
                </span>
              </div>
              <div className="ob-scroll ob-scroll-bid min-h-0 flex-1 space-y-0.5">
                {bids.map((level) => (
                  <div
                    key={level.price}
                    className="flex justify-between py-0.5 font-mono tabular-nums"
                  >
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {level.price}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-300">
                      {level.quantity}
                    </span>
                  </div>
                ))}
                {bids.length === 0 && (
                  <p className="text-zinc-300 dark:text-zinc-600">Empty</p>
                )}
              </div>
            </div>
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="mb-1.5 flex shrink-0 items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    Asks
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    Price ↑ ascending
                  </p>
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  Qty
                </span>
              </div>
              <div className="ob-scroll ob-scroll-ask min-h-0 flex-1 space-y-0.5">
                {asks.map((level) => (
                  <div
                    key={level.price}
                    className="flex justify-between py-0.5 font-mono tabular-nums"
                  >
                    <span className="text-red-600 dark:text-red-400">
                      {level.price}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-300">
                      {level.quantity}
                    </span>
                  </div>
                ))}
                {asks.length === 0 && (
                  <p className="text-zinc-300 dark:text-zinc-600">Empty</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            History
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
              {(["trades", "bbo"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setHistoryTab(option);
                    setHistoryPage(0);
                  }}
                  className={`rounded px-2.5 py-1 font-medium uppercase ${
                    historyTab === option
                      ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {historyRows.length} rows
            </span>
          </div>
        </div>

        {historyRows.length === 0 ? (
          <Empty>
            {historyTab === "trades"
              ? "No durable trades yet."
              : "No BBO snapshots yet."}
          </Empty>
        ) : historyTab === "trades" ? (
          <div className="max-h-[320px] divide-y divide-zinc-100 overflow-y-auto text-sm dark:divide-zinc-800">
            {(historySlice as HistoryTrade[]).map((trade) => (
              <div
                key={trade.tradeId}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <span className="font-medium text-zinc-950 dark:text-zinc-50">
                  {trade.quantity} @ {trade.price}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {formatTime(trade.time)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-h-[320px] divide-y divide-zinc-100 overflow-y-auto text-sm dark:divide-zinc-800">
            {(historySlice as BboSnapshot[]).map((row) => (
              <div
                key={`${row.time}-${row.engineSequence}`}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {row.bestBid ?? "—"}
                  </span>
                  {" / "}
                  <span className="text-red-600 dark:text-red-400">
                    {row.bestAsk ?? "—"}
                  </span>
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {formatTime(row.time)}
                </span>
              </div>
            ))}
          </div>
        )}

        <Pager
          page={safeHistoryPage}
          pageCount={historyPageCount}
          onPrev={() => setHistoryPage((p) => Math.max(0, p - 1))}
          onNext={() =>
            setHistoryPage((p) => Math.min(historyPageCount - 1, p + 1))
          }
        />
      </section>
    </div>
  );
}

function Pager({
  page,
  pageCount,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 flex shrink-0 items-center justify-between gap-3">
      <button
        type="button"
        disabled={page <= 0}
        onClick={onPrev}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Previous
      </button>
      <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
        Page {page + 1} / {pageCount}
      </span>
      <button
        type="button"
        disabled={page >= pageCount - 1}
        onClick={onNext}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Next
      </button>
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
      <p className="text-xs text-zinc-400 dark:text-zinc-500">{label}</p>
      <p
        className={`font-semibold ${
          tone === "bid"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "ask"
              ? "text-red-600 dark:text-red-400"
              : "text-zinc-950 dark:text-zinc-50"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
      {children}
    </p>
  );
}
