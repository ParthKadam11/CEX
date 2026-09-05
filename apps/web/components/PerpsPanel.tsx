"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { TradeTickMessage } from "@cex/app-contracts";
import type { Balance, OrderBookSnapshot, Position } from "@cex/exchange-types";
import { CandleChart } from "@/components/CandleChart";
import { MarketMakerControls } from "@/components/MarketMakerControls";
import { OrderBookPanel } from "@/components/OrderBookPanel";
import { useMarketStream } from "@/hooks/useMarketStream";
import { PERP_VENUE } from "@/lib/markets";
import {
  balanceFor,
  buildLiveCandles,
  errorMessage,
  formatTime,
  normalizeCandle,
  OPEN_ORDER_STATUSES,
  type Candle,
  type HistoryTrade,
  type LiveTapeTrade,
  type TradingOrder,
} from "@/lib/trading";

export function PerpsPanel() {
  const market = PERP_VENUE.symbol;
  const marketQs = `market=${encodeURIComponent(market)}`;

  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [historyCandles, setHistoryCandles] = useState<Candle[]>([]);
  const [tape, setTape] = useState<LiveTapeTrade[]>([]);
  const [mode, setMode] = useState<"limit" | "market">("limit");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [tif, setTif] = useState<"GTC" | "IOC" | "FOK">("GTC");
  const [price, setPrice] = useState("100");
  const [quantity, setQuantity] = useState("1");
  const [quoteBudget, setQuoteBudget] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [markPrice, setMarkPrice] = useState<number | null>(null);
  const [leverage, setLeverage] = useState("5");

  const { book, setBook, connected: streamConnected } = useMarketStream({
    market,
    onPosition: (next) => {
      setPosition(next.size === 0 ? null : next);
    },
    onTrade: (trade: TradeTickMessage) => {
      setMessage(`Trade ${trade.quantity} SOL @ ${trade.price} USD`);
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
      void loadBalances();
      void loadOrders();
      void loadPositions();
      void loadMark();
    },
  });

  const liveCandles = useMemo(
    () => buildLiveCandles(tape, 60_000, 90),
    [tape],
  );
  const chartCandles = useMemo(() => {
    if (liveCandles.length === 0) return historyCandles;
    if (historyCandles.length === 0) return liveCandles;
    const byBucket = new Map(
      historyCandles.map((c) => [c.bucket, normalizeCandle(c)] as const),
    );
    for (const c of liveCandles) byBucket.set(c.bucket, normalizeCandle(c));
    return [...byBucket.values()]
      .sort((a, b) => b.bucket.localeCompare(a.bucket))
      .slice(0, 90);
  }, [historyCandles, liveCandles]);
  const chartInterval = liveCandles.length > 0 ? "1m live" : "1m history";

  const lastPrice =
    tape[0]?.price ??
    (book.bbo.bestBid != null && book.bbo.bestAsk != null
      ? (Number(book.bbo.bestBid) + Number(book.bbo.bestAsk)) / 2
      : (book.bbo.bestBid ?? book.bbo.bestAsk));
  const prevPrice = tape[1]?.price ?? null;
  const priceUp =
    lastPrice == null || prevPrice == null
      ? true
      : Number(lastPrice) >= Number(prevPrice);

  const stats = useMemo(() => {
    const prices = tape.map((t) => Number(t.price)).filter(Number.isFinite);
    const volumes = tape.map((t) => Number(t.quantity)).filter(Number.isFinite);
    const high = prices.length ? Math.max(...prices) : null;
    const low = prices.length ? Math.min(...prices) : null;
    const vol = volumes.reduce((sum, v) => sum + v, 0);
    const first = prices.at(-1) ?? null;
    const last = prices[0] ?? null;
    const change =
      first != null && last != null && first !== 0
        ? last - first
        : null;
    const changePct =
      change != null && first != null && first !== 0
        ? (change / first) * 100
        : null;
    return { high, low, vol, change, changePct };
  }, [tape]);

  useEffect(() => {
    async function bootstrap() {
      await Promise.all([
        loadBook(),
        loadBalances(),
        loadOrders(),
        loadCandles(),
        loadTradeHistory(true),
        loadPositions(),
        loadMark(),
      ]);
    }
    void bootstrap();

    const refreshTimer = window.setInterval(() => {
      void loadOrders();
      void loadBalances();
      void loadPositions();
      void loadMark();
    }, 1_000);

    return () => {
      window.clearInterval(refreshTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once on mount
  }, []);

  // Keep MM heartbeat aware that a viewer is on Trade (does not change intensity).
  useEffect(() => {
    let stopped = false;

    async function ping() {
      try {
        await fetch("/api/sim/market-maker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "presence", market }),
        });
      } catch {
        // ignore — heartbeat may start on next ping
      }
    }

    void ping();
    const timer = window.setInterval(() => {
      if (!stopped) void ping();
    }, 20_000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [market]);

  const usd = balanceFor(balances, "USD");
  const orderValue =
    mode === "market" && side === "BUY"
      ? Number(quoteBudget) || 0
      : (Number(price) || 0) * (Number(quantity) || 0);
  const estMargin =
    Number(leverage) > 0 ? Math.ceil(orderValue / Number(leverage)) : null;
  const displayMark =
    markPrice ?? (lastPrice != null ? Number(lastPrice) : null);
  const upnl =
    position && displayMark != null
      ? position.size * (displayMark - position.entryPrice)
      : null;

  async function loadBook() {
    const response = await fetch(`/api/market/book?${marketQs}`, { cache: "no-store" });
    if (!response.ok) return;
    setBook((await response.json()) as OrderBookSnapshot);
  }

  async function loadOrders() {
    const response = await fetch("/api/orders?limit=30", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { orders?: TradingOrder[] };
    setOrders(
      Array.isArray(body.orders)
        ? body.orders.filter((o) => !o.market || o.market === market)
        : [],
    );
  }

  async function loadBalances() {
    const response = await fetch(`/api/market/balances?${marketQs}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { balances: Balance[] };
    setBalances(body.balances ?? []);
  }

  async function loadPositions() {
    const response = await fetch(`/api/market/positions?${marketQs}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { positions?: Position[] };
    const rows = Array.isArray(body.positions) ? body.positions : [];
    setPosition(rows.find((row) => row.size !== 0) ?? null);
  }

  async function loadMark() {
    const response = await fetch(`/api/market/mark?${marketQs}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { mark?: number | null };
    setMarkPrice(body.mark ?? null);
  }

  async function loadCandles() {
    const response = await fetch(`/api/market/history/candles?${marketQs}&limit=60`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { candles?: Candle[] };
    setHistoryCandles(
      Array.isArray(body.candles)
        ? body.candles.map((candle) => normalizeCandle(candle))
        : [],
    );
  }

  async function loadTradeHistory(force = false) {
    const response = await fetch(`/api/market/history/trades?${marketQs}&limit=120`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { trades?: HistoryTrade[] };
    if (!Array.isArray(body.trades) || body.trades.length === 0) return;
    const mapped = body.trades.map((trade) => ({
      id: trade.tradeId,
      price: Number(trade.price),
      quantity: Number(trade.quantity),
      at: new Date(trade.time).getTime(),
    }));
    setTape((current) => {
      if (!force && current.length > 0) {
        const seen = new Set(current.map((row) => row.id));
        const merged = [
          ...current,
          ...mapped.filter((row) => !seen.has(row.id)),
        ];
        return merged.sort((a, b) => b.at - a.at).slice(0, 120);
      }
      return mapped;
    });
  }

  function setMidPrice() {
    if (book.bbo.bestBid != null && book.bbo.bestAsk != null) {
      setPrice(
        String(
          Math.round(
            (Number(book.bbo.bestBid) + Number(book.bbo.bestAsk)) / 2,
          ),
        ),
      );
      return;
    }
    if (lastPrice != null) setPrice(String(Math.round(Number(lastPrice))));
  }

  function setBboPrice() {
    const next =
      side === "BUY" ? book.bbo.bestAsk : book.bbo.bestBid;
    if (next != null) setPrice(String(next));
  }

  async function placeOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const isMarket = mode === "market";
    const payload: Record<string, unknown> = {
      clientOrderId: `perp-${crypto.randomUUID()}`,
      market,
      side,
      orderType: isMarket ? "MARKET" : "LIMIT",
      timeInForce: isMarket ? "IOC" : tif,
      price: isMarket ? 0 : Number(price),
      quantity: Number(quantity),
      leverage: Number(leverage),
    };
    if (isMarket) {
      const px = (displayMark ?? Number(price)) || 1;
      payload.quoteBudget =
        side === "BUY"
          ? Number(quoteBudget)
          : Math.max(1, Math.ceil(Number(quantity) * px));
    }

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as {
      order?: TradingOrder;
      error?: { code?: string; message?: string } | string;
    };
    setSubmitting(false);

    if (!response.ok) {
      setMessage(errorMessage(body) ?? "Order rejected");
      return;
    }
    setMessage(`Order ${body.order?.engineOrderId ?? "submitted"}`);
    await Promise.all([
      loadOrders(),
      loadBalances(),
      loadBook(),
      loadPositions(),
      loadMark(),
    ]);
  }

  async function cancelOrder(orderId: string) {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string } | string;
      };
      setMessage(errorMessage(body) ?? "Cancel failed");
      return;
    }
    setMessage("Cancel requested");
    await Promise.all([
      loadOrders(),
      loadBalances(),
      loadBook(),
      loadPositions(),
      loadMark(),
    ]);
  }

  async function paperFund(amount = 10_000) {
    const response = await fetch("/api/market/credit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asset: "USD", amount, market }),
    });
    if (!response.ok) {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string } | string;
      };
      setMessage(errorMessage(body) ?? "Credit failed");
      return;
    }
    setMessage(`Credited ${amount} USD margin`);
    window.setTimeout(() => {
      void loadBalances();
    }, 500);
  }

  return (
    <div className="flex w-full flex-col">
      {/* Ticker */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-zinc-200 px-1 py-3 dark:border-zinc-800">
        <div className="flex items-end gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Perpetual
            </p>
            <h1 className="text-balance text-lg leading-none font-semibold text-zinc-950 dark:text-zinc-50">
              SOL-USD-PERP
            </h1>
          </div>
          <span
            className={`pb-px text-2xl leading-none font-semibold tabular-nums ${
              priceUp
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {fmtNum(lastPrice)}
          </span>
        </div>

        <TickerStat
          label="24h Change"
          value={
            stats.change == null
              ? "—"
              : `${stats.change >= 0 ? "+" : ""}${fmtNum(stats.change)} ${
                  stats.changePct == null
                    ? ""
                    : `(${stats.changePct >= 0 ? "+" : ""}${stats.changePct.toFixed(2)}%)`
                }`
          }
          tone={
            stats.change == null
              ? undefined
              : stats.change >= 0
                ? "up"
                : "down"
          }
        />
        <TickerStat label="24h High" value={fmtNum(stats.high)} />
        <TickerStat label="24h Low" value={fmtNum(stats.low)} />
        <TickerStat label="Volume" value={fmtNum(stats.vol)} />
        <TickerStat label="Bid" value={fmtNum(book.bbo.bestBid)} tone="up" />
        <TickerStat label="Ask" value={fmtNum(book.bbo.bestAsk)} tone="down" />
        <TickerStat label="Mark" value={fmtNum(displayMark)} />

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`rounded px-2 py-1 text-[11px] font-medium ${
              streamConnected
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {streamConnected ? "Live" : "Connecting"}
          </span>
          <MarketMakerControls
            market={market}
            onTickAction={(result) => {
              if (result.wiped) {
                setBook({
                  market,
                  bids: [],
                  asks: [],
                  bbo: { bestBid: null, bestAsk: null },
                });
                setTape([]);
                setHistoryCandles([]);
                void loadOrders();
                void loadBalances();
                return;
              }
              if (result.book) setBook(result.book);
              if (result.prints && result.prints.length > 0) {
                const at = Date.now();
                setTape((current) =>
                  [
                    ...result.prints!.map((print, index) => ({
                      id: `sim-${at}-${index}-${print.price}`,
                      price: print.price,
                      quantity: print.quantity,
                      at: at + index,
                    })),
                    ...current,
                  ].slice(0, 120),
                );
              } else if (result.traded) {
                void loadTradeHistory(true);
              }
            }}
          />
        </div>
      </div>

      {/* Main workspace */}
      <div className="grid h-[min(720px,calc(100dvh-12rem))] min-h-[560px] gap-px overflow-hidden bg-zinc-200 dark:bg-zinc-800 lg:grid-cols-[minmax(0,1fr)_280px_320px] lg:grid-rows-[minmax(0,1fr)]">
        {/* Chart */}
        <section className="flex min-h-0 flex-col overflow-hidden bg-white dark:bg-zinc-950">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                Chart
              </h2>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {chartInterval}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                title="Paper-credit USD margin (not on-chain)"
                onClick={() => paperFund(10_000)}
                className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                +USD margin
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <CandleChart
              candles={chartCandles}
              intervalLabel={chartInterval}
              className="h-full"
            />
          </div>
        </section>

        {/* Order book */}
        <OrderBookPanel
          book={book}
          trades={tape}
          lastTradePrice={tape[0]?.price ?? null}
          className="min-h-0 overflow-hidden rounded-none border-0 bg-white dark:bg-zinc-950"
          onSelectPrice={(next) => {
            setPrice(String(next));
            setMode("limit");
          }}
        />

        {/* Trade ticket */}
        <section className="flex min-h-0 flex-col overflow-y-auto bg-white p-4 dark:bg-zinc-950">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900">
            {(["BUY", "SELL"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSide(option)}
                className={`h-9 rounded text-sm font-semibold transition ${
                  side === option
                    ? option === "BUY"
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-red-500 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {option === "BUY" ? "Long" : "Short"}
              </button>
            ))}
          </div>

          <div className="mb-4 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
            {(["limit", "market"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`border-b-2 px-2.5 py-2 text-xs font-medium capitalize ${
                  mode === option
                    ? "border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50"
                    : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <form className="flex flex-1 flex-col gap-3" onSubmit={placeOrder}>
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Margin available</span>
                <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
                  {usd.available.toLocaleString()} USD
                </span>
              </div>

              {mode === "limit" && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Price (USD)
                    </span>
                    <div className="flex gap-1">
                      <QuickChip label="Mid" onClick={setMidPrice} />
                      <QuickChip label="BBO" onClick={setBboPrice} />
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 font-mono text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-500"
                    required
                  />
                </div>
              )}

              <TicketField
                label="Size (SOL)"
                value={quantity}
                onChange={setQuantity}
              />

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    Leverage
                  </span>
                  <span className="tabular-nums text-[11px] text-zinc-500">
                    {leverage}x
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  aria-label="Leverage"
                  className="w-full accent-zinc-900 dark:accent-zinc-100"
                />
                <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
                  {(["1", "5", "10", "20"] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setLeverage(n)}
                    >
                      {n}x
                    </button>
                  ))}
                </div>
              </div>

              {mode === "market" && side === "BUY" && (
                <TicketField
                  label="Quote budget (USD)"
                  value={quoteBudget}
                  onChange={setQuoteBudget}
                />
              )}

              {mode === "limit" && (
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <label className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={tif === "IOC"}
                      onChange={(e) =>
                        setTif(e.target.checked ? "IOC" : "GTC")
                      }
                      className="rounded border-zinc-300 dark:border-zinc-600"
                    />
                    IOC
                  </label>
                  <label className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={tif === "FOK"}
                      onChange={(e) =>
                        setTif(e.target.checked ? "FOK" : "GTC")
                      }
                      className="rounded border-zinc-300 dark:border-zinc-600"
                    />
                    FOK
                  </label>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Notional</span>
                <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
                  {fmtNum(orderValue)} USD
                </span>
              </div>
              {estMargin != null && (
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Est. margin</span>
                  <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
                    {fmtNum(estMargin)} USD
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={`mt-auto h-11 w-full rounded-md text-sm font-semibold text-white transition disabled:opacity-50 ${
                  side === "BUY"
                    ? "bg-emerald-500 hover:bg-emerald-400"
                    : "bg-red-500 hover:bg-red-400"
                }`}
              >
                {submitting
                  ? "Submitting…"
                  : `${side === "BUY" ? "Long" : "Short"} ${leverage}x`}
              </button>
            </form>

          {message && (
            <p className="mt-3 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
              {message}
            </p>
          )}
        </section>
      </div>


      {/* Position */}
      <section className="border-t border-zinc-200 bg-white px-1 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Position
          </h2>
          <span className="text-xs text-zinc-400">Mark {fmtNum(displayMark)}</span>
        </div>
        {!position ? (
          <p className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No open position. Long or short to open one.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <TickerStat
              label="Side"
              value={position.size > 0 ? "Long" : "Short"}
              tone={position.size > 0 ? "up" : "down"}
            />
            <TickerStat label="Size" value={fmtNum(Math.abs(position.size))} />
            <TickerStat label="Entry" value={fmtNum(position.entryPrice)} />
            <TickerStat label="Margin" value={fmtNum(position.margin)} />
            <TickerStat
              label="uPnL"
              value={
                upnl == null
                  ? "—"
                  : `${upnl >= 0 ? "+" : ""}${fmtNum(upnl)}`
              }
              tone={upnl == null ? undefined : upnl >= 0 ? "up" : "down"}
            />
          </div>
        )}
      </section>

      {/* Orders */}
      <section className="border-t border-zinc-200 bg-white px-1 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Open / recent perp orders
          </h2>
          <Link
            href="/dashboard/orders"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Full history · {orders.length}
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No SOL-USD-PERP orders yet.
          </p>
        ) : (
          <div className="max-h-[240px] divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
            {orders.map((order) => {
              const open = OPEN_ORDER_STATUSES.includes(
                order.status as (typeof OPEN_ORDER_STATUSES)[number],
              );
              const expanded = expandedOrderId === order.id;
              return (
                <div key={order.id} className="py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() =>
                        setExpandedOrderId(expanded ? null : order.id)
                      }
                    >
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">
                        <span
                          className={
                            order.side === "BUY"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          {order.side === "BUY" ? "Long" : "Short"}
                        </span>{" "}
                        {order.type} {order.quantity} SOL @{" "}
                        {order.price || "mkt"}
                      </p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        filled {order.filledQuantity}/{order.quantity}
                        {order.failureReason
                          ? ` · ${order.failureReason}`
                          : ""}
                      </p>
                    </button>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {order.status}
                      </span>
                      {open && (
                        <button
                          type="button"
                          onClick={() => cancelOrder(order.engineOrderId)}
                          className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <OrderFills
                      orderId={order.engineOrderId}
                      fallback={order.fills}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function OrderFills({
  orderId,
  fallback,
}: {
  orderId: string;
  fallback?: TradingOrder["fills"];
}) {
  const [fills, setFills] = useState(fallback ?? []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}`,
        { cache: "no-store" },
      );
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as TradingOrder;
      if (!cancelled && Array.isArray(body.fills)) setFills(body.fills);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (fills.length === 0) {
    return (
      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">No fills.</p>
    );
  }

  return (
    <div className="mt-2 space-y-1 border-l border-zinc-100 pl-3 dark:border-zinc-800">
      {fills.map((fill) => (
        <p key={fill.id} className="text-xs text-zinc-500 dark:text-zinc-400">
          Fill {fill.quantity} @ {fill.price} · {formatTime(fill.createdAt)}
        </p>
      ))}
    </div>
  );
}

function TickerStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex flex-col justify-end">
      <p className="text-[11px] leading-none text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-1 text-sm leading-none font-medium tabular-nums ${
          tone === "up"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "down"
              ? "text-red-600 dark:text-red-400"
              : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TicketField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <input
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 font-mono text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-500"
        required
      />
    </label>
  );
}

function QuickChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {label}
    </button>
  );
}

function fmtNum(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, {
    maximumFractionDigits: n < 10 ? 4 : 2,
  });
}
