"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { venueForSymbol } from "@/lib/markets";
import {
  formatTime,
  OPEN_ORDER_STATUSES,
  type TradingOrder,
  type TradingOrderFill,
} from "@/lib/trading";
import { cn } from "@/lib/utils";

type StatusTab = "open" | "filled" | "closed" | "all";
type MarketFilter = "all" | "SOL-USD" | "SOL-USD-PERP";
type SideFilter = "all" | "BUY" | "SELL";
type TypeFilter = "all" | "LIMIT" | "MARKET";
type RangeFilter = "all" | "today" | "7d";

const FILLED_STATUSES = new Set(["FILLED"]);
const CLOSED_STATUSES = new Set(["CANCELLED", "REJECTED", "FAILED"]);

function isOpen(status: string) {
  return OPEN_ORDER_STATUSES.includes(
    status as (typeof OPEN_ORDER_STATUSES)[number],
  );
}

function avgFillPrice(fills: TradingOrderFill[] | undefined): number | null {
  if (!fills || fills.length === 0) return null;
  let notional = 0;
  let qty = 0;
  for (const fill of fills) {
    notional += fill.price * fill.quantity;
    qty += fill.quantity;
  }
  if (qty <= 0) return null;
  return notional / qty;
}

function inRange(createdAt: string, range: RangeFilter): boolean {
  if (range === "all") return true;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  const now = Date.now();
  if (range === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return created >= start.getTime();
  }
  return created >= now - 7 * 24 * 60 * 60 * 1000;
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
    case "PENDING":
      return "Pending";
    case "ACCEPTED":
      return "Accepted";
    case "OPEN":
      return "Open";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}

function sideLabel(order: TradingOrder): string {
  const venue = venueForSymbol(order.market);
  if (venue.kind === "PERP") {
    return order.side === "BUY" ? "Long" : "Short";
  }
  return order.side === "BUY" ? "Buy" : "Sell";
}

export function OrdersPanel() {
  const [orders, setOrders] = useState<TradingOrder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TradingOrder | null>(null);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<StatusTab>("open");
  const [market, setMarket] = useState<MarketFilter>("all");
  const [side, setSide] = useState<SideFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [range, setRange] = useState<RangeFilter>("all");

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(selectedId)}`,
        { cache: "no-store" },
      );
      if (!response.ok || cancelled) return;
      setDetail((await response.json()) as TradingOrder);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function loadInitial() {
    setLoading(true);
    const response = await fetch("/api/orders?limit=40", { cache: "no-store" });
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
      `/api/orders?limit=40&cursor=${encodeURIComponent(nextCursor)}`,
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

  const counts = useMemo(() => {
    const open = orders.filter((o) => isOpen(o.status)).length;
    const filled = orders.filter((o) => FILLED_STATUSES.has(o.status)).length;
    const closed = orders.filter((o) => CLOSED_STATUSES.has(o.status)).length;
    return { open, filled, closed, all: orders.length };
  }, [orders]);

  const visible = useMemo(() => {
    return orders.filter((order) => {
      if (tab === "open" && !isOpen(order.status)) return false;
      if (tab === "filled" && !FILLED_STATUSES.has(order.status)) return false;
      if (tab === "closed" && !CLOSED_STATUSES.has(order.status)) return false;
      if (market !== "all" && order.market !== market) return false;
      if (side !== "all" && order.side !== side) return false;
      if (type !== "all" && order.type !== type) return false;
      if (!inRange(order.createdAt, range)) return false;
      return true;
    });
  }, [orders, tab, market, side, type, range]);

  const activeSelectedId =
    selectedId && visible.some((order) => order.engineOrderId === selectedId)
      ? selectedId
      : null;

  const selected = !activeSelectedId
    ? null
    : detail?.engineOrderId === activeSelectedId
      ? detail
      : (orders.find((o) => o.engineOrderId === activeSelectedId) ?? null);
  const selectedVenue = venueForSymbol(selected?.market);
  const selectedAvg = avgFillPrice(selected?.fills);
  const selectedOpen = selected ? isOpen(selected.status) : false;

  return (
    <div className="animate-fade-up w-full py-6 sm:py-8">
      <header className="mb-8 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="font-display text-3xl tracking-tight text-zinc-950 dark:text-zinc-50">
          Orders
        </h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
          Full history of your paper trades: open, filled, and cancelled.
        </p>
      </header>

      <div
        className="mb-6 flex flex-wrap gap-x-6 gap-y-1 border-b border-zinc-200 dark:border-zinc-800"
        role="tablist"
        aria-label="Order status"
      >
        {(
          [
            ["open", "Open", counts.open],
            ["filled", "Filled", counts.filled],
            ["closed", "Cancelled", counts.closed],
            ["all", "All", counts.all],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px border-b-2 pb-3 text-sm font-medium transition-colors",
              tab === id
                ? "border-zinc-950 text-zinc-950 dark:border-zinc-50 dark:text-zinc-50"
                : "border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
            )}
          >
            {label}
            <span
              className={cn(
                "ml-2 tabular-nums",
                tab === id
                  ? "text-zinc-500"
                  : "text-zinc-300 dark:text-zinc-600",
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <FilterSelect
          label="Market"
          value={market}
          onChange={(value) => setMarket(value as MarketFilter)}
          options={[
            { value: "all", label: "All markets" },
            { value: "SOL-USD", label: "Spot" },
            { value: "SOL-USD-PERP", label: "Perps" },
          ]}
        />
        <FilterSelect
          label="Side"
          value={side}
          onChange={(value) => setSide(value as SideFilter)}
          options={[
            { value: "all", label: "All sides" },
            { value: "BUY", label: "Buy / Long" },
            { value: "SELL", label: "Sell / Short" },
          ]}
        />
        <FilterSelect
          label="Type"
          value={type}
          onChange={(value) => setType(value as TypeFilter)}
          options={[
            { value: "all", label: "All types" },
            { value: "LIMIT", label: "Limit" },
            { value: "MARKET", label: "Market" },
          ]}
        />
        <FilterSelect
          label="Time"
          value={range}
          onChange={(value) => setRange(value as RangeFilter)}
          options={[
            { value: "all", label: "All time" },
            { value: "today", label: "Today" },
            { value: "7d", label: "Last 7 days" },
          ]}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <section className="min-w-0">
          {loading ? (
            <p className="py-16 text-center text-sm text-zinc-400">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-zinc-400 dark:text-zinc-500">
              No orders match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
                    <th className="pb-3 pr-3 font-medium">Time</th>
                    <th className="pb-3 pr-3 font-medium">Market</th>
                    <th className="pb-3 pr-3 font-medium">Side</th>
                    <th className="pb-3 pr-3 font-medium">Type</th>
                    <th className="pb-3 pr-3 font-medium">Size</th>
                    <th className="pb-3 pr-3 font-medium">Price</th>
                    <th className="pb-3 pr-3 font-medium">Filled</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {visible.map((order) => {
                    const active = activeSelectedId === order.engineOrderId;
                    const venue = venueForSymbol(order.market);
                    return (
                      <tr
                        key={order.id}
                        className={cn(
                          "cursor-pointer align-middle transition-colors",
                          active
                            ? "bg-zinc-50 dark:bg-zinc-900/60"
                            : "hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40",
                        )}
                        onClick={() =>
                          setSelectedId(active ? null : order.engineOrderId)
                        }
                      >
                        <td className="py-3.5 pr-3 whitespace-nowrap text-zinc-400">
                          {formatTime(order.createdAt)}
                        </td>
                        <td className="py-3.5 pr-3 text-zinc-600 dark:text-zinc-300">
                          {venue.label}
                        </td>
                        <td
                          className={cn(
                            "py-3.5 pr-3 font-medium",
                            order.side === "BUY"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400",
                          )}
                        >
                          {sideLabel(order)}
                        </td>
                        <td className="py-3.5 pr-3 capitalize text-zinc-600 dark:text-zinc-300">
                          {order.type.toLowerCase()}
                        </td>
                        <td className="py-3.5 pr-3 tabular-nums text-zinc-950 dark:text-zinc-50">
                          {order.quantity.toLocaleString()}
                        </td>
                        <td className="py-3.5 pr-3 tabular-nums text-zinc-950 dark:text-zinc-50">
                          {order.price > 0 ? order.price.toLocaleString() : "Mkt"}
                        </td>
                        <td className="py-3.5 pr-3 tabular-nums text-zinc-500">
                          {order.filledQuantity.toLocaleString()}/
                          {order.quantity.toLocaleString()}
                        </td>
                        <td className="py-3.5 text-zinc-600 dark:text-zinc-300">
                          {friendlyStatus(order.status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {nextCursor ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="mt-6 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-950 disabled:opacity-50 dark:hover:text-zinc-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </section>

        <aside className="min-w-0 lg:border-l lg:border-zinc-200 lg:pl-8 dark:lg:border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Detail
          </h2>
          {!selected ? (
            <p className="mt-6 text-sm text-zinc-400 dark:text-zinc-500">
              Select a row to see fills and status.
            </p>
          ) : (
            <div className="mt-5 space-y-4 text-sm">
              <DetailRow label="Market" value={selectedVenue.label} />
              <DetailRow
                label="Side / type"
                value={`${sideLabel(selected)} · ${selected.type.toLowerCase()}${
                  selected.timeInForce ? ` · ${selected.timeInForce}` : ""
                }`}
              />
              <DetailRow
                label="Size"
                value={`${selected.quantity.toLocaleString()} SOL`}
              />
              <DetailRow
                label="Price"
                value={
                  selected.price > 0
                    ? selected.price.toLocaleString()
                    : "Market"
                }
              />
              <DetailRow
                label="Filled"
                value={`${selected.filledQuantity.toLocaleString()} / ${selected.quantity.toLocaleString()}`}
              />
              <DetailRow
                label="Avg fill"
                value={
                  selectedAvg != null
                    ? selectedAvg.toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })
                    : "—"
                }
              />
              <DetailRow
                label="Status"
                value={friendlyStatus(selected.status)}
              />
              {selected.failureReason ? (
                <DetailRow label="Reason" value={selected.failureReason} />
              ) : null}
              <DetailRow label="Order id" value={selected.engineOrderId} />

              <div className="flex flex-wrap gap-2 pt-1">
                {selectedOpen ? (
                  <button
                    type="button"
                    onClick={() => void cancelOrder(selected.engineOrderId)}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    Cancel
                  </button>
                ) : null}
                <Link
                  href={selectedVenue.href}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Open {selectedVenue.label}
                </Link>
              </div>

              <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">
                  Fills
                </p>
                {(selected.fills?.length ?? 0) === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    No fills yet.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {selected.fills!.map((fill) => (
                      <div
                        key={fill.id}
                        className="flex justify-between gap-3 py-2 text-xs"
                      >
                        <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
                          {fill.quantity.toLocaleString()} @{" "}
                          {fill.price.toLocaleString()}
                        </span>
                        <span className="shrink-0 text-zinc-400">
                          {formatTime(fill.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {message ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {message}
                </p>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex min-w-[8rem] flex-col gap-1">
      <span className="text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
        {label}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-md border px-2.5 text-left text-xs transition-colors",
          open
            ? "border-zinc-400 bg-white text-zinc-950 dark:border-zinc-500 dark:bg-zinc-950 dark:text-zinc-50"
            : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:border-zinc-600",
        )}
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-zinc-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute top-[calc(100%+4px)] left-0 z-40 min-w-full overflow-hidden rounded-md border border-zinc-200 bg-white py-0.5 dark:border-zinc-700 dark:bg-zinc-950"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors",
                    active
                      ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
                  )}
                >
                  <span>{option.label}</span>
                  {active ? (
                    <Check className="size-3 shrink-0 text-zinc-500" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-zinc-400 dark:text-zinc-500">{label}</span>
      <span className="max-w-[65%] text-right font-medium break-all text-zinc-950 dark:text-zinc-50">
        {value}
      </span>
    </div>
  );
}
