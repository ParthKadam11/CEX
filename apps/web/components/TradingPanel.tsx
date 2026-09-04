"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BboMessage,
  TradeTickMessage,
} from "@cex/app-contracts";
import type { Balance, OrderBookSnapshot } from "@cex/exchange-types";

type TradingOrder = {
  id: string;
  engineOrderId: string;
  clientOrderId: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  price: number;
  quantity: number;
  filledQuantity: number;
  status: string;
  createdAt: string;
};

type ApiError = {
  error?: string;
};

const initialBook: OrderBookSnapshot = {
  market: "SOL-USD",
  bids: [],
  asks: [],
  bbo: { bestBid: null, bestAsk: null },
};

export function TradingPanel() {
  const [book, setBook] = useState(initialBook);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [mode, setMode] = useState<"limit" | "swap">("limit");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState("100");
  const [quantity, setQuantity] = useState("1");
  const [fromAsset, setFromAsset] = useState<"USD" | "SOL">("USD");
  const [swapAmount, setSwapAmount] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    void loadBook();
    void loadBalances();
    void loadOrders();

    const source = new EventSource("/api/market/stream");
    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);
    source.addEventListener("book", (event) => {
      const nextBook = parseEvent<OrderBookSnapshot>(event);
      if (nextBook) setBook(nextBook);
    });
    source.addEventListener("bbo", (event) => {
      const bbo = parseEvent<BboMessage>(event);
      if (bbo) setBook((current) => ({ ...current, bbo }));
    });
    source.addEventListener("trade", (event) => {
      const trade = parseEvent<TradeTickMessage>(event);
      if (trade) setMessage(`Trade ${trade.quantity} SOL @ ${trade.price} USD`);
    });

    const refreshTimer = window.setInterval(() => {
      void loadOrders();
    }, 2_000);

    return () => {
      source.close();
      window.clearInterval(refreshTimer);
    };
  }, []);

  const asks = useMemo(() => [...book.asks].reverse(), [book.asks]);

  async function loadBook() {
    const response = await fetch("/api/market/book", { cache: "no-store" });
    if (!response.ok) return;
    setBook((await response.json()) as OrderBookSnapshot);
  }

  async function loadOrders() {
    const response = await fetch("/api/orders", { cache: "no-store" });
    if (!response.ok) return;
    setOrders((await response.json()) as TradingOrder[]);
  }

  async function loadBalances() {
    const response = await fetch("/api/market/balances", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { balances: Balance[] };
    setBalances(body.balances);
  }

  function available(asset: Balance["asset"]): number {
    return balances.find((balance) => balance.asset === asset)?.available ?? 0;
  }

  async function placeOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientOrderId: `web-${crypto.randomUUID()}`,
        market: "SOL-USD",
        side,
        orderType: "LIMIT",
        timeInForce: "GTC",
        price: Number(price),
        quantity: Number(quantity),
      }),
    });
    const body = (await response.json()) as ApiError & {
      order?: TradingOrder;
      error?: { code?: string; message?: string } | string;
    };
    setSubmitting(false);

    if (!response.ok) {
      setMessage(errorMessage(body) ?? "Order rejected");
      return;
    }
    setMessage(`Order ${body.order?.engineOrderId ?? "submitted"}`);
    await loadOrders();
    await loadBalances();
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
    const body = (await response.json()) as ApiError & {
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
    await loadOrders();
    await loadBalances();
  }

  async function cancelOrder(orderId: string) {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      const body = (await response.json()) as ApiError & {
        error?: { code?: string; message?: string } | string;
      };
      setMessage(errorMessage(body) ?? "Cancel failed");
      return;
    }
    setMessage("Cancel requested");
    await loadOrders();
    await loadBalances();
  }

  return (
    <div className="animate-fade-up w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-sm text-zinc-500">Spot</p>
          <h1 className="font-display text-3xl tracking-tight text-zinc-950">
            SOL / USD
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <Metric label="Bid" value={book.bbo.bestBid} tone="bid" />
          <Metric label="Ask" value={book.bbo.bestAsk} tone="ask" />
          <Metric label="USD" value={available("USD")} />
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              streamConnected
                ? "bg-emerald-50 text-emerald-700"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {streamConnected ? "Live" : "Connecting"}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-lg border border-zinc-200 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950">Order book</h2>
            <span className="text-xs text-zinc-400">Ticks · lots</span>
          </div>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <BookSide title="Bids" levels={book.bids} tone="bid" />
            <BookSide title="Asks" levels={asks} tone="ask" />
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950">Trade</h2>
            <div className="flex rounded-md border border-zinc-200 p-0.5 text-xs">
              {(["limit", "swap"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={`rounded px-2.5 py-1 font-medium capitalize ${
                    mode === option
                      ? "bg-zinc-950 text-white"
                      : "text-zinc-500 hover:text-zinc-950"
                  }`}
                >
                  {option === "swap" ? "Convert" : "Limit"}
                </button>
              ))}
            </div>
          </div>

          {mode === "limit" ? (
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
                        : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <form className="space-y-3" onSubmit={placeOrder}>
                <Field label="Price (USD)" value={price} onChange={setPrice} />
                <Field
                  label="Quantity (SOL)"
                  value={quantity}
                  onChange={setQuantity}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-10 w-full rounded-md bg-zinc-950 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : `${side} SOL`}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mb-3 text-xs text-zinc-400">
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
                        ? "bg-zinc-950 text-white"
                        : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
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
                <p className="text-xs text-zinc-400">
                  Available {fromAsset}: {available(fromAsset)}
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-10 w-full rounded-md bg-zinc-950 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {submitting
                    ? "Converting…"
                    : `Convert ${fromAsset} → ${fromAsset === "USD" ? "SOL" : "USD"}`}
                </button>
              </form>
            </>
          )}
          {message && (
            <p className="mt-3 text-center text-xs text-zinc-500">{message}</p>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-zinc-200 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950">Your orders</h2>
          <span className="text-xs text-zinc-400">{orders.length} total</span>
        </div>
        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">
            No SOL-USD orders yet.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-zinc-950">
                    {order.side} {order.quantity} SOL @ {order.price} USD
                  </p>
                  <p className="text-xs text-zinc-400">{order.engineOrderId}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500">{order.status}</span>
                  {["PENDING", "ACCEPTED", "OPEN", "PARTIALLY_FILLED"].includes(
                    order.status,
                  ) && (
                    <button
                      type="button"
                      onClick={() => cancelOrder(order.engineOrderId)}
                      className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
        {value ?? "—"}
      </p>
    </div>
  );
}

function BookSide({
  title,
  levels,
  tone,
}: {
  title: string;
  levels: OrderBookSnapshot["bids"];
  tone: "bid" | "ask";
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-zinc-400">
        <span>{title}</span>
        <span>Qty</span>
      </div>
      <div className="space-y-1">
        {levels.slice(0, 8).map((level) => (
          <div key={level.price} className="flex justify-between">
            <span
              className={
                tone === "bid" ? "text-emerald-600" : "text-red-600"
              }
            >
              {level.price}
            </span>
            <span className="text-zinc-600">{level.quantity}</span>
          </div>
        ))}
        {levels.length === 0 && (
          <p className="text-zinc-300">Empty</p>
        )}
      </div>
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
      <span className="mb-1.5 block text-xs font-medium text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-400"
        required
      />
    </label>
  );
}

function parseEvent<T>(event: Event): T | null {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as T;
  } catch {
    return null;
  }
}

function errorMessage(body: {
  error?: { code?: string; message?: string } | string;
}): string | undefined {
  if (typeof body.error === "string") return body.error;
  return body.error?.message ?? body.error?.code;
}
