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
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState("100");
  const [quantity, setQuantity] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [funding, setFunding] = useState("Not initialized");
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
      if (bbo) {
        setBook((current) => ({ ...current, bbo }));
      }
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
    const nextBook = (await response.json()) as OrderBookSnapshot;
    setBook(nextBook);
  }

  async function loadOrders() {
    const response = await fetch("/api/orders", { cache: "no-store" });
    if (!response.ok) return;
    const nextOrders = (await response.json()) as TradingOrder[];
    setOrders(nextOrders);
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

  async function initializeFunding() {
    setFunding("Initializing...");
    const response = await fetch("/api/funding/sync", { method: "POST" });
    const body = (await response.json()) as {
      amount?: number;
      existing?: boolean;
      error?: string;
    };
    if (!response.ok) {
      setFunding(body.error ?? "Funding failed");
      return;
    }
    setFunding(
      body.existing
        ? `Trading balance already initialized: ${body.amount} USD`
        : `Trading balance initialized: ${body.amount} USD`,
    );
    await loadBalances();
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
    };
    setSubmitting(false);

    if (!response.ok) {
      setMessage(body.error ?? "Order rejected");
      return;
    }
    setMessage(`Order ${body.order?.engineOrderId ?? "submitted"}`);
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
      const body = (await response.json()) as ApiError;
      setMessage(body.error ?? "Cancel failed");
      return;
    }
    setMessage("Cancel requested");
    await loadOrders();
    await loadBalances();
  }

  return (
    <div className="animate-fade-up w-full max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/15 bg-slate-950/60 px-5 py-4 backdrop-blur-xl">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/50">
            Spot market
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-white">SOL / USD</h1>
        </div>
        <div className="flex items-center gap-5 text-right">
          <div>
            <p className="text-xs text-white/50">Best bid</p>
            <p className="text-lg font-semibold text-emerald-300">
              {book.bbo.bestBid ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-white/50">Best ask</p>
            <p className="text-lg font-semibold text-rose-300">
              {book.bbo.bestAsk ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-white/50">Available USD</p>
            <p className="text-lg font-semibold text-white">
              {available("USD")}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs ${
              streamConnected
                ? "bg-emerald-400/15 text-emerald-200"
                : "bg-white/10 text-white/50"
            }`}
          >
            {streamConnected ? "Live" : "Connecting"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-2xl border border-white/15 bg-slate-950/60 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-white">Order book</h2>
            <span className="text-xs text-white/45">Integer ticks and lots</span>
          </div>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <BookSide title="Bids" levels={book.bids} tone="bid" />
            <BookSide title="Asks" levels={asks} tone="ask" />
          </div>
        </section>

        <section className="rounded-2xl border border-white/15 bg-slate-950/60 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-white">Place order</h2>
            <span className="text-xs text-white/45">GTC limit</span>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {(["BUY", "SELL"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSide(option)}
                className={`rounded-xl py-2 text-sm font-semibold ${
                  side === option
                    ? option === "BUY"
                      ? "bg-emerald-400 text-emerald-950"
                      : "bg-rose-400 text-rose-950"
                    : "bg-white/10 text-white/60"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <form className="space-y-3" onSubmit={placeOrder}>
            <Field label="Price (USD)" value={price} onChange={setPrice} />
            <Field label="Quantity (SOL)" value={quantity} onChange={setQuantity} />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-white/90 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : `${side} SOL`}
            </button>
          </form>
          <button
            type="button"
            onClick={initializeFunding}
            className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 py-2 text-xs text-white/75 hover:bg-white/15"
          >
            Initialize USD trading balance
          </button>
          <p className="mt-2 text-center text-xs text-white/45">{funding}</p>
          {message && <p className="mt-3 text-center text-xs text-white/70">{message}</p>}
        </section>
      </div>

      <section className="rounded-2xl border border-white/15 bg-slate-950/60 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-white">Your orders</h2>
          <span className="text-xs text-white/45">{orders.length} total</span>
        </div>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/50">
            No SOL-USD orders yet.
          </p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-white">
                    {order.side} {order.quantity} SOL @ {order.price} USD
                  </p>
                  <p className="text-xs text-white/45">{order.engineOrderId}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white/70">{order.status}</span>
                  {["PENDING", "ACCEPTED", "OPEN", "PARTIALLY_FILLED"].includes(
                    order.status,
                  ) && (
                    <button
                      type="button"
                      onClick={() => cancelOrder(order.engineOrderId)}
                      className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
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
      <div className="mb-2 flex justify-between text-xs text-white/45">
        <span>{title}</span>
        <span>Qty</span>
      </div>
      <div className="space-y-1">
        {levels.slice(0, 8).map((level) => (
          <div key={level.price} className="flex justify-between">
            <span className={tone === "bid" ? "text-emerald-300" : "text-rose-300"}>
              {level.price}
            </span>
            <span className="text-white/65">{level.quantity}</span>
          </div>
        ))}
        {levels.length === 0 && <p className="text-white/35">Empty</p>}
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
      <span className="mb-1 block text-xs text-white/50">{label}</span>
      <input
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
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
