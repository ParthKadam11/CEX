"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Balance } from "@cex/exchange-types";
import { WalletCard } from "@/components/WalletCard";
import { useMarketStream } from "@/hooks/useMarketStream";
import {
  balanceFor,
  errorMessage,
  formatTime,
  type TradingOrder,
} from "@/lib/trading";

type DashboardHomeProps = {
  publicKey: string | null;
};

export function DashboardHome({ publicKey }: DashboardHomeProps) {
  const { data: session } = useSession();
  const { book, connected } = useMarketStream();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [funding, setFunding] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    const [balancesRes, ordersRes] = await Promise.all([
      fetch("/api/market/balances", { cache: "no-store" }),
      fetch("/api/orders?limit=8", { cache: "no-store" }),
    ]);

    if (balancesRes.ok) {
      const body = (await balancesRes.json()) as { balances: Balance[] };
      setBalances(body.balances ?? []);
    }
    if (ordersRes.ok) {
      const body = (await ordersRes.json()) as { orders?: TradingOrder[] };
      setOrders(Array.isArray(body.orders) ? body.orders : []);
    }
  }

  async function paperFund(asset: "USD" | "SOL", amount: number) {
    setFunding(true);
    setMessage("");
    const response = await fetch("/api/market/credit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asset, amount }),
    });
    const body = (await response.json()) as {
      error?: { code?: string; message?: string } | string;
    };
    setFunding(false);
    if (!response.ok) {
      setMessage(errorMessage(body) ?? "Credit failed");
      return;
    }
    setMessage(`Credited ${amount} ${asset} to trading account`);
    window.setTimeout(() => void refresh(), 500);
  }

  const usd = balanceFor(balances, "USD");
  const sol = balanceFor(balances, "SOL");
  const name = session?.user?.name?.split(" ")[0] ?? "trader";

  return (
    <div className="animate-fade-up w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-sm text-zinc-500">Overview</p>
          <h1 className="font-display text-3xl tracking-tight text-zinc-950">
            {name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <Stat label="Best bid" value={book.bbo.bestBid} tone="bid" />
          <Stat label="Best ask" value={book.bbo.bestAsk} tone="ask" />
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">
              Trading balances
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Engine ledger used for SOL-USD orders. On-chain wallet is separate.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={funding}
              onClick={() => paperFund("USD", 10_000)}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              +10,000 USD
            </button>
            <button
              type="button"
              disabled={funding}
              onClick={() => paperFund("SOL", 100)}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              +100 SOL
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <BalanceTile asset="USD" available={usd.available} locked={usd.locked} />
          <BalanceTile asset="SOL" available={sol.available} locked={sol.locked} />
        </div>
        {message && <p className="mt-3 text-xs text-zinc-500">{message}</p>}
      </section>

      <section className="rounded-lg border border-zinc-200 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-950">Recent orders</h2>
          <Link
            href="/dashboard/orders"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-950"
          >
            View all
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">
            No orders yet.{" "}
            <Link href="/trade" className="text-zinc-700 underline">
              Place one on Trade
            </Link>
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
                    {order.side} {order.quantity} @ {order.price}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {formatTime(order.createdAt)} · filled {order.filledQuantity}
                  </p>
                </div>
                <span className="text-zinc-500">{order.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <WalletCard publicKey={publicKey} />
    </div>
  );
}

function BalanceTile({
  asset,
  available,
  locked,
}: {
  asset: string;
  available: number;
  locked: number;
}) {
  return (
    <div className="rounded-md bg-zinc-50 px-4 py-4">
      <p className="text-xs font-medium text-zinc-500">{asset}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950">
        {available.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        Available · {locked.toLocaleString()} locked
      </p>
    </div>
  );
}

function Stat({
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
