"use client";

import { useMemo, useState } from "react";
import type { OrderBookSnapshot } from "@cex/exchange-types";
import type { LiveTapeTrade } from "@/lib/trading";
import { AlignJustify, ArrowDown, ArrowUp } from "lucide-react";

type ViewMode = "both" | "asks" | "bids";
type PanelTab = "book" | "trades";

const GROUP_OPTIONS = [1, 5, 10, 25] as const;
const LEVELS_BOTH = 24;
const LEVELS_SINGLE = 40;

type OrderBookPanelProps = {
  book: OrderBookSnapshot;
  trades: LiveTapeTrade[];
  lastTradePrice?: number | null;
  onSelectPrice?: (price: number) => void;
  className?: string;
};

type DepthRow = {
  price: number;
  size: number;
  total: number;
};

export function OrderBookPanel({
  book,
  trades,
  lastTradePrice,
  onSelectPrice,
  className = "",
}: OrderBookPanelProps) {
  const [tab, setTab] = useState<PanelTab>("book");
  const [view, setView] = useState<ViewMode>("both");
  const [groupIndex, setGroupIndex] = useState(0);
  const group = GROUP_OPTIONS[groupIndex] ?? 1;

  const asks = useMemo(
    () =>
      buildSide(
        book.asks,
        group,
        "ask",
        view === "both" ? LEVELS_BOTH : LEVELS_SINGLE,
      ),
    [book.asks, group, view],
  );
  const bids = useMemo(
    () =>
      buildSide(
        book.bids,
        group,
        "bid",
        view === "both" ? LEVELS_BOTH : LEVELS_SINGLE,
      ),
    [book.bids, group, view],
  );

  const maxTotal = Math.max(
    asks.at(-1)?.total ?? 0,
    bids.at(-1)?.total ?? 0,
    1,
  );

  const bidVol = bids.reduce((sum, row) => sum + row.size, 0);
  const askVol = asks.reduce((sum, row) => sum + row.size, 0);
  const totalVol = bidVol + askVol;
  const bidPct = totalVol === 0 ? 50 : Math.round((bidVol / totalVol) * 100);
  const askPct = 100 - bidPct;

  const mid = toNumber(
    book.bbo.bestBid != null && book.bbo.bestAsk != null
      ? (Number(book.bbo.bestBid) + Number(book.bbo.bestAsk)) / 2
      : (book.bbo.bestBid ?? book.bbo.bestAsk),
  );
  const mark = toNumber(lastTradePrice) ?? mid;
  const markUp =
    mark != null && book.bbo.bestAsk != null
      ? mark >= Number(book.bbo.bestAsk)
      : mark != null && book.bbo.bestBid != null
        ? mark >= Number(book.bbo.bestBid)
        : true;

  return (
    <section
      className={`flex h-full min-h-0 max-h-full flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 ${className}`}
    >
      <div className="flex shrink-0 items-center gap-1 px-3 pt-3">
        {(["book", "trades"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
              tab === option
                ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-200"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "book" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between px-3 py-2">
              <div className="flex items-center gap-1">
                <ViewButton
                  active={view === "both"}
                  onClick={() => setView("both")}
                  label="Both"
                >
                  <AlignJustify className="size-3.5" />
                </ViewButton>
                <ViewButton
                  active={view === "asks"}
                  onClick={() => setView("asks")}
                  label="Asks"
                >
                  <ArrowUp className="size-3.5 text-red-600 dark:text-red-400" />
                </ViewButton>
                <ViewButton
                  active={view === "bids"}
                  onClick={() => setView("bids")}
                  label="Bids"
                >
                  <ArrowDown className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                </ViewButton>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300">
                <button
                  type="button"
                  className="px-1.5 py-0.5 text-zinc-400 hover:text-zinc-950 disabled:opacity-30 dark:hover:text-white"
                  disabled={groupIndex === 0}
                  onClick={() => setGroupIndex((i) => Math.max(0, i - 1))}
                >
                  −
                </button>
                <span className="min-w-[2.5rem] text-center tabular-nums">
                  {group}
                </span>
                <button
                  type="button"
                  className="px-1.5 py-0.5 text-zinc-400 hover:text-zinc-950 disabled:opacity-30 dark:hover:text-white"
                  disabled={groupIndex === GROUP_OPTIONS.length - 1}
                  onClick={() =>
                    setGroupIndex((i) =>
                      Math.min(GROUP_OPTIONS.length - 1, i + 1),
                    )
                  }
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-3 px-3 pb-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              <span>Price (USD)</span>
              <span className="text-right">Size (SOL)</span>
              <span className="text-right">Total (SOL)</span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-mono text-[12px] tabular-nums">
              {(view === "both" || view === "asks") && (
                <div className="ob-scroll ob-scroll-ask min-h-0 flex-1">
                  <div className="flex min-h-full flex-col justify-end">
                    {asks.length === 0 ? (
                      <EmptyRow>No asks</EmptyRow>
                    ) : (
                      asks.map((row) => (
                        <DepthLevel
                          key={`a-${row.price}`}
                          row={row}
                          maxTotal={maxTotal}
                          tone="ask"
                          onSelect={onSelectPrice}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}

              {view === "both" && (
                <div className="flex shrink-0 items-baseline gap-2 bg-zinc-50 px-3 py-2 dark:bg-zinc-900/40">
                  <span
                    className={`text-lg font-semibold leading-none ${
                      markUp
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatPrice(mark)}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {formatPrice(mid)}
                  </span>
                </div>
              )}

              {(view === "both" || view === "bids") && (
                <div className="ob-scroll ob-scroll-bid min-h-0 flex-1">
                  {bids.length === 0 ? (
                    <EmptyRow>No bids</EmptyRow>
                  ) : (
                    bids.map((row) => (
                      <DepthLevel
                        key={`b-${row.price}`}
                        row={row}
                        maxTotal={maxTotal}
                        tone="bid"
                        onSelect={onSelectPrice}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 px-3 pb-3 pt-2">
              <div className="relative flex h-5 overflow-hidden rounded-sm text-[10px] font-medium">
                <div
                  className="flex items-center bg-emerald-500/90 pl-2 text-white dark:text-zinc-950"
                  style={{ width: `${bidPct}%` }}
                >
                  {bidPct}%
                </div>
                <div
                  className="flex items-center justify-end bg-red-500/90 pr-2 text-white dark:text-zinc-950"
                  style={{ width: `${askPct}%` }}
                >
                  {askPct}%
                </div>
              </div>
            </div>
          </div>
        ) : (
          <TradesTab trades={trades} />
        )}
      </div>
    </section>
  );
}

const TRADES_PAGE_SIZE = 40;

function TradesTab({ trades }: { trades: LiveTapeTrade[] }) {
  const [visible, setVisible] = useState(TRADES_PAGE_SIZE);
  const rows = trades.slice(0, visible);
  const hasMore = trades.length > visible;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid shrink-0 grid-cols-3 px-3 py-2 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span>Price (USD)</span>
        <span className="text-right">Size (SOL)</span>
        <span className="text-right">Time</span>
      </div>
      <div className="ob-scroll min-h-0 flex-1 font-mono text-[12px] tabular-nums">
        {rows.length === 0 ? (
          <EmptyRow>No trades yet</EmptyRow>
        ) : (
          rows.map((trade, index) => {
            const prev = trades[index + 1];
            const price = Number(trade.price);
            const prevPrice = prev ? Number(prev.price) : null;
            const up = prevPrice == null || price >= prevPrice;
            return (
              <div
                key={`${trade.id}-${trade.at}`}
                className="grid grid-cols-3 px-3 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
              >
                <span
                  className={
                    up
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {formatPrice(price)}
                </span>
                <span className="text-right text-zinc-700 dark:text-zinc-200">
                  {trade.quantity}
                </span>
                <span className="text-right text-zinc-400 dark:text-zinc-500">
                  {new Date(trade.at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </span>
              </div>
            );
          })
        )}
      </div>
      {hasMore && (
        <div className="shrink-0 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setVisible((n) => n + TRADES_PAGE_SIZE)}
            className="w-full rounded-md py-1.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          >
            Load more ({trades.length - visible} left)
          </button>
        </div>
      )}
    </div>
  );
}

function DepthLevel({
  row,
  maxTotal,
  tone,
  onSelect,
}: {
  row: DepthRow;
  maxTotal: number;
  tone: "bid" | "ask";
  onSelect?: (price: number) => void;
}) {
  const width = Math.min(100, (row.total / maxTotal) * 100);
  const bar =
    tone === "bid"
      ? "bg-emerald-500/15 dark:bg-emerald-500/20"
      : "bg-red-500/15 dark:bg-red-500/20";
  const price =
    tone === "bid"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(row.price)}
      className="relative grid w-full grid-cols-3 px-3 py-[3px] text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
    >
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 ${bar}`}
        style={{ width: `${width}%` }}
      />
      <span className={`relative ${price}`}>{row.price}</span>
      <span className="relative text-right text-zinc-700 dark:text-zinc-200">
        {row.size}
      </span>
      <span className="relative text-right text-zinc-400 dark:text-zinc-400">
        {row.total}
      </span>
    </button>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`rounded p-1.5 transition ${
        active
          ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-white"
          : "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-500 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-6 text-center font-sans text-xs text-zinc-400 dark:text-zinc-600">
      {children}
    </p>
  );
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatPrice(value: unknown): string {
  const n = toNumber(value);
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function buildSide(
  levels: OrderBookSnapshot["bids"],
  group: number,
  side: "bid" | "ask",
  limit: number,
): DepthRow[] {
  const buckets = new Map<number, number>();
  for (const level of levels) {
    const rawPrice = Number(level.price);
    const rawSize = Number(level.quantity);
    if (!Number.isFinite(rawPrice) || !Number.isFinite(rawSize)) continue;
    const price =
      side === "bid"
        ? Math.floor(rawPrice / group) * group
        : Math.ceil(rawPrice / group) * group;
    buckets.set(price, (buckets.get(price) ?? 0) + rawSize);
  }

  const bestFirst = [...buckets.entries()].sort((a, b) =>
    side === "bid" ? b[0] - a[0] : a[0] - b[0],
  );

  let running = 0;
  const rows = bestFirst.slice(0, limit).map(([price, size]) => {
    running += size;
    return { price, size, total: running };
  });

  return side === "ask" ? [...rows].reverse() : rows;
}
