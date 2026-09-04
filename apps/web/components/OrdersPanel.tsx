"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  formatTime,
  OPEN_ORDER_STATUSES,
  type TradingOrder,
  type TradingOrderFill,
} from "@/lib/trading";

export function OrdersPanel() {
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TradingOrder | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId]);

  async function loadInitial() {
    setLoading(true);
    const response = await fetch("/api/orders?limit=20", { cache: "no-store" });
    setLoading(false);
    if (!response.ok) return;
    const body = (await response.json()) as {
      orders?: TradingOrder[];
      nextCursor?: string | null;
    };
    setOrders(Array.isArray(body.orders) ? body.orders : []);
    setNextCursor(body.nextCursor ?? null);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const response = await fetch(
      `/api/orders?limit=20&cursor=${encodeURIComponent(nextCursor)}`,
      { cache: "no-store" },
    );
    setLoadingMore(false);
    if (!response.ok) return;
    const body = (await response.json()) as {
      orders?: TradingOrder[];
      nextCursor?: string | null;
    };
    setOrders((current) => [
      ...current,
      ...(Array.isArray(body.orders) ? body.orders : []),
    ]);
    setNextCursor(body.nextCursor ?? null);
  }

  async function loadDetail(orderId: string) {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    setDetail((await response.json()) as TradingOrder);
  }

  async function cancelOrder(engineOrderId: string) {
    setMessage("");
    const response = await fetch(
      `/api/orders/${encodeURIComponent(engineOrderId)}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    if (!response.ok) {
      setMessage("Cancel failed");
      return;
    }
    setMessage("Cancel requested");
    await loadInitial();
    if (selectedId) await loadDetail(selectedId);
  }

  return (
    <div className="animate-fade-up w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-sm text-zinc-500">OMS</p>
          <h1 className="font-display text-3xl tracking-tight text-zinc-950">
            Orders
          </h1>
        </div>
        <Link
          href="/trade"
          className="rounded-md bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Trade
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-zinc-200 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950">History</h2>
            <span className="text-xs text-zinc-400">{orders.length} loaded</span>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              No orders yet.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() =>
                    setSelectedId(
                      selectedId === order.engineOrderId
                        ? null
                        : order.engineOrderId,
                    )
                  }
                  className={`flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left text-sm transition ${
                    selectedId === order.engineOrderId
                      ? "bg-zinc-50"
                      : "hover:bg-zinc-50/80"
                  }`}
                >
                  <div>
                    <p className="font-medium text-zinc-950">
                      {order.side} {order.type} · {order.quantity} @{" "}
                      {order.price || "mkt"}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {formatTime(order.createdAt)} · filled{" "}
                      {order.filledQuantity}/{order.quantity}
                    </p>
                  </div>
                  <span className="text-zinc-500">{order.status}</span>
                </button>
              ))}
            </div>
          )}
          {nextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="mt-4 w-full rounded-md border border-zinc-200 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-950">
            Order detail
          </h2>
          {!detail ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              Select an order to see fills and status.
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              <DetailRow label="Engine id" value={detail.engineOrderId} />
              <DetailRow label="Client id" value={detail.clientOrderId} />
              <DetailRow label="Status" value={detail.status} />
              <DetailRow
                label="Side / type"
                value={`${detail.side} ${detail.type} ${detail.timeInForce ?? ""}`}
              />
              <DetailRow
                label="Price / qty"
                value={`${detail.price} / ${detail.quantity}`}
              />
              <DetailRow
                label="Filled"
                value={`${detail.filledQuantity}`}
              />
              {detail.failureReason && (
                <DetailRow label="Reason" value={detail.failureReason} />
              )}
              {OPEN_ORDER_STATUSES.includes(
                detail.status as (typeof OPEN_ORDER_STATUSES)[number],
              ) && (
                <button
                  type="button"
                  onClick={() => void cancelOrder(detail.engineOrderId)}
                  className="w-full rounded-md border border-zinc-200 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel order
                </button>
              )}
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Fills</p>
                {(detail.fills?.length ?? 0) === 0 ? (
                  <p className="text-xs text-zinc-400">No fills yet.</p>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {detail.fills!.map((fill: TradingOrderFill) => (
                      <div
                        key={fill.id}
                        className="flex justify-between py-2 text-xs"
                      >
                        <span className="text-zinc-600">
                          {fill.quantity} @ {fill.price}
                        </span>
                        <span className="text-zinc-400">
                          {formatTime(fill.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {message && (
                <p className="text-xs text-zinc-500">{message}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className="text-right font-medium text-zinc-950 break-all">
        {value}
      </span>
    </div>
  );
}
