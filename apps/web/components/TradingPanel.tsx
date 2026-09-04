"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TradeTickMessage } from "@cex/app-contracts";
import type { Balance, OrderBookSnapshot } from "@cex/exchange-types";
import { CandleChart } from "@/components/CandleChart";
import { MarketMakerControls } from "@/components/MarketMakerControls";
import { OrderBookPanel } from "@/components/OrderBookPanel";
import { useMarketStream } from "@/hooks/useMarketStream";
import {
  balanceFor,
  errorMessage,
  formatTime,
  OPEN_ORDER_STATUSES,
  type Candle,
  type HistoryTrade,
  type LiveTapeTrade,
  type TradingOrder,
} from "@/lib/trading";

export function TradingPanel() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tape, setTape] = useState<LiveTapeTrade[]>([]);
  const [mode, setMode] = useState<"limit" | "market" | "swap">("limit");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [tif, setTif] = useState<"GTC" | "IOC" | "FOK">("GTC");
  const [price, setPrice] = useState("100");
  const [quantity, setQuantity] = useState("1");
  const [quoteBudget, setQuoteBudget] = useState("100");
  const [fromAsset, setFromAsset] = useState<"USD" | "SOL">("USD");
  const [swapAmount, setSwapAmount] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const { book, setBook, connected: streamConnected } = useMarketStream({
    onTrade: (trade: TradeTickMessage) => {
      setMessage(`Trade ${trade.quantity} SOL @ ${trade.price} USD`);
      setTape((current) =>
        [
          {
            id: trade.tradeId,
            price: trade.price,
            quantity: trade.quantity,
            at: Date.now(),
          },
          ...current,
        ].slice(0, 40),
      );
      void loadCandles();
      void loadBalances();
      void loadOrders();
    },
  });

  useEffect(() => {
    async function bootstrap() {
      await Promise.all([
        loadBook(),
        loadBalances(),
        loadOrders(),
        loadCandles(),
        loadTradeHistory(),
      ]);
    }
    void bootstrap();

    const refreshTimer = window.setInterval(() => {
      void loadOrders();
      void loadBalances();
    }, 1_000);

    return () => {
      window.clearInterval(refreshTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once on mount
  }, []);

  const usd = balanceFor(balances, "USD");
  const sol = balanceFor(balances, "SOL");

  async function loadBook() {
    const response = await fetch("/api/market/book", { cache: "no-store" });
    if (!response.ok) return;
    setBook((await response.json()) as OrderBookSnapshot);
  }

  async function loadOrders() {
    const response = await fetch("/api/orders?limit=30", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { orders?: TradingOrder[] };
    setOrders(Array.isArray(body.orders) ? body.orders : []);
  }

  async function loadBalances() {
    const response = await fetch("/api/market/balances", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { balances: Balance[] };
    setBalances(body.balances ?? []);
  }

  async function loadCandles() {
    const response = await fetch("/api/market/history/candles?limit=60", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { candles?: Candle[] };
    setCandles(Array.isArray(body.candles) ? body.candles : []);
  }

  async function loadTradeHistory(force = false) {
    const response = await fetch("/api/market/history/trades?limit=40", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { trades?: HistoryTrade[] };
    if (!Array.isArray(body.trades) || body.trades.length === 0) return;
    const mapped = body.trades.map((trade) => ({
      id: trade.tradeId,
      price: trade.price,
      quantity: trade.quantity,
      at: new Date(trade.time).getTime(),
    }));
    setTape((current) => {
      if (!force && current.length > 0) return current;
      return mapped;
    });
  }

  async function placeOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const isMarket = mode === "market";
    const payload: Record<string, unknown> = {
      clientOrderId: `web-${crypto.randomUUID()}`,
      market: "SOL-USD",
      side,
      orderType: isMarket ? "MARKET" : "LIMIT",
      timeInForce: isMarket ? "IOC" : tif,
      price: isMarket ? 0 : Number(price),
      quantity: Number(quantity),
    };
    if (isMarket && side === "BUY") {
      payload.quoteBudget = Number(quoteBudget);
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
    await Promise.all([loadOrders(), loadBalances(), loadBook()]);
  }

  async function placeSwap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const toAsset = fromAsset === "USD" ? "SOL" : "USD";
    const response = await fetch("/api/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fromAsset,
        toAsset,
        amount: Number(swapAmount),
        fillMode: "IOC",
      }),
    });
    const body = (await response.json()) as {
      order?: TradingOrder;
      error?: { code?: string; message?: string } | string;
    };
    setSubmitting(false);

    if (!response.ok) {
      setMessage(errorMessage(body) ?? "Swap rejected");
      return;
    }
    setMessage(
      `Swap ${fromAsset}→${toAsset}: ${body.order?.engineOrderId ?? "submitted"}`,
    );
    await Promise.all([loadOrders(), loadBalances(), loadBook()]);
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
    await Promise.all([loadOrders(), loadBalances(), loadBook()]);
  }

  async function paperFund(asset: "USD" | "SOL", amount: number) {
    const response = await fetch("/api/market/credit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asset, amount }),
    });
    if (!response.ok) {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string } | string;
      };
      setMessage(errorMessage(body) ?? "Credit failed");
      return;
    }
    setMessage(`Credited ${amount} ${asset}`);
    window.setTimeout(() => {
      void loadBalances();
    }, 500);
  }

  return (
    <div className="animate-fade-up w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Spot</p>
          <h1 className="font-display text-3xl tracking-tight text-zinc-950 dark:text-zinc-50">
            SOL / USD
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <Metric label="Bid" value={book.bbo.bestBid} tone="bid" />
          <Metric label="Ask" value={book.bbo.bestAsk} tone="ask" />
          <Metric label="USD avail" value={usd.available} />
          <Metric label="SOL avail" value={sol.available} />
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              streamConnected
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {streamConnected ? "Live" : "Connecting"}
          </span>
          <MarketMakerControls
            onTick={(result) => {
              if (result.book) setBook(result.book);
              if (result.traded) {
                void loadTradeHistory(true);
                void loadCandles();
              }
            }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <BalanceBar
          asset="USD"
          available={usd.available}
          locked={usd.locked}
          onFund={() => paperFund("USD", 10_000)}
        />
        <BalanceBar
          asset="SOL"
          available={sol.available}
          locked={sol.locked}
          onFund={() => paperFund("SOL", 100)}
        />
      </div>

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Chart
          </h2>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            Timescale 1m candles
          </span>
        </div>
        <CandleChart candles={candles} />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,0.95fr)_minmax(300px,1fr)]">
        <OrderBookPanel
          book={book}
          trades={tape}
          lastTradePrice={tape[0]?.price ?? null}
          onSelectPrice={(next) => {
            setPrice(String(next));
            setMode("limit");
          }}
        />

        <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              Trade
            </h2>
            <div className="flex rounded-md border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
              {(["limit", "market", "swap"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`rounded px-2.5 py-1 font-medium capitalize ${
                    mode === option
                      ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                  }`}
                >
                  {option === "swap" ? "Convert" : option}
                </button>
              ))}
            </div>
          </div>

          {mode === "swap" ? (
            <>
              <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
                Market convert against the live book (IOC).
              </p>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(["USD", "SOL"] as const).map((asset) => (
                  <button
                    key={asset}
                    type="button"
                    onClick={() => setFromAsset(asset)}
                    className={`h-9 rounded-md text-sm font-medium ${
                      fromAsset === asset
                        ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                        : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {asset} → {asset === "USD" ? "SOL" : "USD"}
                  </button>
                ))}
              </div>
              <form className="space-y-3" onSubmit={placeSwap}>
                <Field
                  label={
                    fromAsset === "USD" ? "Spend (USD)" : "Sell amount (SOL)"
                  }
                  value={swapAmount}
                  onChange={setSwapAmount}
                />
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Available {fromAsset}:{" "}
                  {fromAsset === "USD" ? usd.available : sol.available}
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-10 w-full rounded-md bg-zinc-950 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {submitting
                    ? "Converting…"
                    : `Convert ${fromAsset} → ${fromAsset === "USD" ? "SOL" : "USD"}`}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(["BUY", "SELL"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSide(option)}
                    className={`h-9 rounded-md text-sm font-medium ${
                      side === option
                        ? option === "BUY"
                          ? "bg-emerald-600 text-white"
                          : "bg-red-600 text-white"
                        : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <form className="space-y-3" onSubmit={placeOrder}>
                {mode === "limit" && (
                  <>
                    <Field
                      label="Price (USD)"
                      value={price}
                      onChange={setPrice}
                    />
                    <div>
                      <span className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Time in force
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["GTC", "IOC", "FOK"] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setTif(option)}
                            className={`h-8 rounded-md text-xs font-medium ${
                              tif === option
                                ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                                : "border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <Field
                  label="Quantity (SOL)"
                  value={quantity}
                  onChange={setQuantity}
                />
                {mode === "market" && side === "BUY" && (
                  <Field
                    label="Quote budget (USD)"
                    value={quoteBudget}
                    onChange={setQuoteBudget}
                  />
                )}
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Need{" "}
                  {side === "BUY"
                    ? `USD (avail ${usd.available})`
                    : `SOL (avail ${sol.available})`}
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-10 w-full rounded-md bg-zinc-950 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {submitting
                    ? "Submitting…"
                    : `${side} ${mode === "market" ? "market" : "limit"}`}
                </button>
              </form>
            </>
          )}
          {message && (
            <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
              {message}
            </p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Your orders
          </h2>
          <Link
            href="/dashboard/orders"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Full history · {orders.length}
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No SOL-USD orders yet.
          </p>
        ) : (
          <div className="max-h-[320px] divide-y divide-zinc-100 overflow-y-auto overscroll-contain dark:divide-zinc-800">
            {orders.map((order) => {
              const open = OPEN_ORDER_STATUSES.includes(
                order.status as (typeof OPEN_ORDER_STATUSES)[number],
              );
              const expanded = expandedOrderId === order.id;
              return (
                <div key={order.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() =>
                        setExpandedOrderId(expanded ? null : order.id)
                      }
                    >
                      <p className="font-medium text-zinc-950 dark:text-zinc-50">
                        {order.side} {order.type} {order.quantity} SOL @{" "}
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
                      <span className="text-zinc-500 dark:text-zinc-400">
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

function BalanceBar({
  asset,
  available,
  locked,
  onFund,
}: {
  asset: string;
  available: number;
  locked: number;
  onFund: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
      <div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">{asset} trading</p>
        <p className="font-semibold text-zinc-950 dark:text-zinc-50">
          {available.toLocaleString()} avail
          <span className="ml-2 font-normal text-zinc-400 dark:text-zinc-500">
            {locked.toLocaleString()} locked
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={onFund}
        className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        Paper fund
      </button>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
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
        {value ?? "—"}
      </p>
    </div>
  );
}

function Field({
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
      <span className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <input
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-500"
        required
      />
    </label>
  );
}
