"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Balance } from "@cex/exchange-types";
import { SPOT_VENUE } from "@/lib/markets";
import {
  balanceFor,
  errorMessage,
  formatTime,
  type TradingOrder,
} from "@/lib/trading";
import { cn } from "@/lib/utils";

const OPEN_STATUSES = new Set([
  "PENDING",
  "ACCEPTED",
  "OPEN",
  "PARTIALLY_FILLED",
  "CANCEL_REQUESTED",
]);

type OrdersTab = "open" | "recent";

export function DashboardHome() {
  const { data: session } = useSession();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [funding, setFunding] = useState(false);
  const [message, setMessage] = useState("");
  const [creditAsset, setCreditAsset] = useState<"USD" | "SOL" | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [ordersTab, setOrdersTab] = useState<OrdersTab>("open");

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    const [balancesRes, ordersRes] = await Promise.all([
      fetch(
        `/api/market/balances?market=${encodeURIComponent(SPOT_VENUE.symbol)}`,
        { cache: "no-store" },
      ),
      fetch("/api/orders?limit=40", { cache: "no-store" }),
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
      body: JSON.stringify({ asset, amount, market: SPOT_VENUE.symbol }),
    });
    const body = (await response.json()) as {
      error?: { code?: string; message?: string } | string;
    };
    setFunding(false);
    if (!response.ok) {
      setMessage(errorMessage(body) ?? "Credit failed");
      return;
    }
    setMessage(`Added ${amount.toLocaleString()} ${asset}`);
    setCreditAsset(null);
    setCreditAmount("");
    window.setTimeout(() => void refresh(), 400);
  }

  function submitCredit() {
    if (!creditAsset) return;
    const amount = Number(creditAmount.replace(/,/g, "").trim());
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setMessage("Enter a whole number greater than zero");
      return;
    }
    void paperFund(creditAsset, amount);
  }

  function startCredit(asset: "USD" | "SOL") {
    setMessage("");
    setCreditAsset(asset);
    setCreditAmount("");
  }

  const usd = balanceFor(balances, "USD");
  const sol = balanceFor(balances, "SOL");
  const name = session?.user?.name?.split(" ")[0] ?? "there";
  const image = session?.user?.image;

  const openOrders = useMemo(
    () => orders.filter((order) => OPEN_STATUSES.has(order.status)),
    [orders],
  );
  const recentOrders = useMemo(
    () =>
      orders.filter((order) => !OPEN_STATUSES.has(order.status)).slice(0, 12),
    [orders],
  );
  const visibleOrders = ordersTab === "open" ? openOrders : recentOrders;

  return (
    <div className="animate-fade-up w-full py-6 sm:py-10">
      <div className="mb-8 flex items-center gap-3 sm:mb-10">
        {image ? (
          <Image
            src={image}
            alt=""
            width={40}
            height={40}
            className="size-10 rounded-full"
          />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-display text-2xl tracking-tight text-zinc-950 dark:text-zinc-50">
            {name}
          </h1>
          <p className="text-sm text-zinc-400">Spot paper ledger</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)] lg:gap-10">
        <section className="order-2 min-w-0 lg:order-1">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex gap-6" role="tablist" aria-label="Orders">
              <OrdersTabButton
                active={ordersTab === "open"}
                onClick={() => setOrdersTab("open")}
                label="Open"
                count={openOrders.length}
              />
              <OrdersTabButton
                active={ordersTab === "recent"}
                onClick={() => setOrdersTab("recent")}
                label="Recent"
                count={recentOrders.length}
              />
            </div>
            <Link
              href="/dashboard/orders"
              className="mb-3 text-sm text-zinc-400 transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              View all
            </Link>
          </div>

          {visibleOrders.length === 0 ? (
            <div className="py-16">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {ordersTab === "open"
                  ? "No open orders."
                  : "No recent fills or cancels yet."}
              </p>
              {ordersTab === "open" && (
                <Link
                  href="/spot"
                  className="mt-3 inline-block text-sm font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  Place on Spot
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    <th className="pb-3 pr-4 font-medium">Side</th>
                    <th className="pb-3 pr-4 font-medium">Market</th>
                    <th className="pb-3 pr-4 font-medium">Size</th>
                    <th className="pb-3 pr-4 font-medium">Price</th>
                    <th className="pb-3 pr-4 font-medium">Filled</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {visibleOrders.map((order) => (
                    <tr key={order.id} className="align-middle">
                      <td
                        className={cn(
                          "py-3.5 pr-4 font-medium",
                          order.side === "BUY"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400",
                        )}
                      >
                        {order.side}
                      </td>
                      <td className="py-3.5 pr-4 text-zinc-600 dark:text-zinc-300">
                        {order.market}
                      </td>
                      <td className="py-3.5 pr-4 tabular-nums text-zinc-950 dark:text-zinc-50">
                        {order.quantity.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-4 tabular-nums text-zinc-950 dark:text-zinc-50">
                        {order.price > 0 ? order.price.toLocaleString() : "—"}
                      </td>
                      <td className="py-3.5 pr-4 tabular-nums text-zinc-500">
                        {order.filledQuantity.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-4 text-zinc-600 dark:text-zinc-300">
                        {friendlyStatus(order.status)}
                      </td>
                      <td className="py-3.5 whitespace-nowrap text-zinc-400">
                        {formatTime(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="order-1 space-y-4 lg:order-2 lg:pt-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Balances
            </h2>
            <p className="text-xs text-zinc-400">Available / locked</p>
          </div>

          <BalanceCard
            asset="USD"
            available={usd.available}
            locked={usd.locked}
            onAdd={() => startCredit("USD")}
            funding={funding}
            adding={creditAsset === "USD"}
          />
          <BalanceCard
            asset="SOL"
            available={sol.available}
            locked={sol.locked}
            onAdd={() => startCredit("SOL")}
            funding={funding}
            adding={creditAsset === "SOL"}
          />

          {creditAsset && (
            <div className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                Add {creditAsset}
              </p>
              <input
                id="credit-amount"
                type="text"
                inputMode="numeric"
                autoFocus
                value={creditAmount}
                onChange={(event) => setCreditAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitCredit();
                  if (event.key === "Escape") {
                    setCreditAsset(null);
                    setCreditAmount("");
                  }
                }}
                placeholder="Amount"
                className="h-10 w-full rounded-md border border-zinc-200 bg-transparent px-3 text-sm tabular-nums text-zinc-950 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-50"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={funding}
                  onClick={submitCredit}
                  className="h-9 flex-1 rounded-md bg-zinc-950 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {funding ? "Adding…" : "Confirm"}
                </button>
                <button
                  type="button"
                  disabled={funding}
                  onClick={() => {
                    setCreditAsset(null);
                    setCreditAmount("");
                  }}
                  className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {message && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function OrdersTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 pb-3 text-sm font-medium transition-colors",
        active
          ? "border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50"
          : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
      )}
    >
      {label}
      <span
        className={cn(
          "ml-2 tabular-nums",
          active ? "text-zinc-500" : "text-zinc-300 dark:text-zinc-600",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function BalanceCard({
  asset,
  available,
  locked,
  onAdd,
  funding,
  adding,
}: {
  asset: string;
  available: number;
  locked: number;
  onAdd: () => void;
  funding: boolean;
  adding: boolean;
}) {
  const total = available + locked;
  const availablePct = total > 0 ? (available / total) * 100 : 100;

  return (
    <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
            {asset}
          </p>
          <p className="mt-2 font-display text-3xl tracking-tight text-zinc-950 tabular-nums dark:text-zinc-50">
            {available.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-zinc-400">available</p>
        </div>
        <button
          type="button"
          disabled={funding}
          onClick={onAdd}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
            adding
              ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
          )}
        >
          Add {asset}
        </button>
      </div>

      <div className="mt-5 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-zinc-950 dark:bg-zinc-100"
          style={{ width: `${availablePct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-zinc-400">
        <span>{availablePct === 100 ? "Fully free" : "Available share"}</span>
        <span className="tabular-nums">{locked.toLocaleString()} locked</span>
      </div>
    </div>
  );
}

function friendlyStatus(status: string): string {
  switch (status) {
    case "PARTIALLY_FILLED":
      return "Partial";
    case "CANCEL_REQUESTED":
      return "Cancelling";
    case "FILLED":
      return "Filled";
    case "CANCELLED":
      return "Cancelled";
    case "REJECTED":
      return "Rejected";
    case "FAILED":
      return "Failed";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}
