"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Settings2, X } from "lucide-react";
import type { OrderBookSnapshot } from "@cex/exchange-types";

type HeartbeatInfo = {
  enabled: boolean;
  intensity: "idle" | "medium" | "high";
  boost: "medium" | "high";
  viewersActive: boolean;
  lastTickAt: number | null;
  lastError: string | null;
  intervalMs: number;
};

type StatusBody = {
  ok?: boolean;
  ticks?: number;
  lastMid?: number;
  heartbeat?: HeartbeatInfo;
  cancelled?: number;
  book?: OrderBookSnapshot | null;
  prints?: { price: number; quantity: number }[];
  traded?: boolean;
  error?: { message?: string };
};

type MarketMakerControlsProps = {
  onTickAction?: (result: StatusBody) => void;
};

/**
 * Controls for the server-side MM heartbeat.
 * Presence / intensity boost is driven from TradingPanel while the user is on /trade.
 */
export function MarketMakerControls({ onTickAction }: MarketMakerControlsProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<HeartbeatInfo | null>(null);
  const [boost, setBoost] = useState<"medium" | "high">("medium");
  const [message, setMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onTickRef = useRef(onTickAction);
  onTickRef.current = onTickAction;

  async function refreshStatus() {
    try {
      const response = await fetch("/api/sim/market-maker?action=status", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as StatusBody;
      if (body.heartbeat) setStatus(body.heartbeat);
    } catch {
      // gateway / web may still be starting
    }
  }

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 4_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sim/market-maker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = (await response.json()) as StatusBody;
      if (!response.ok) {
        setMessage(body.error?.message ?? "Request failed");
        return null;
      }
      if (body.heartbeat) setStatus(body.heartbeat);
      onTickRef.current?.(body);
      return body;
    } catch {
      setMessage("Sim unavailable — is gateway up?");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggleHeartbeat() {
    const enabled = status?.enabled ?? false;
    const body = await post(enabled ? "stop" : "start");
    if (body) {
      setMessage(enabled ? "MM heartbeat paused" : "MM heartbeat running");
    }
  }

  async function applyBoost(next: "medium" | "high") {
    setBoost(next);
    const body = await post("presence", { boost: next });
    if (body) setMessage(`Boost set to ${next} while viewers are on Trade`);
  }

  async function clearBook() {
    const body = await post("clear");
    if (body) {
      setMessage(`Cleared · ${body.cancelled ?? 0} cancelled`);
    }
  }

  async function runOnce() {
    const body = await post("tick", {
      intensity: boost === "high" ? "high" : "medium",
    });
    if (body) setMessage("Manual tick sent");
  }

  const live = status?.enabled ?? false;
  const intensity = status?.intensity ?? "idle";

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      {live && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-50 px-2 py-1 text-[11px] font-semibold tracking-wide text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-950/50 dark:text-emerald-400">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          MM {intensity === "idle" ? "idle" : intensity}
        </span>
      )}

      <button
        type="button"
        aria-label="Market maker settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex size-8 items-center justify-center rounded-md border transition ${
          live
            ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-400"
            : open
              ? "border-zinc-300 bg-zinc-50 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        }`}
      >
        {open ? <X className="size-4" /> : <Settings2 className="size-4" />}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-40 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-zinc-400" />
              <div>
                <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  Market makers
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  Server heartbeat · low load by default
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={live}
              aria-label="Toggle market-maker heartbeat"
              disabled={busy}
              onClick={() => void toggleHeartbeat()}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                live ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  live ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="space-y-3 border-b border-zinc-100 px-3 py-3 dark:border-zinc-800">
            <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Idle ≈ every 4.5s. When you&apos;re on Trade, intensity rises
              automatically so the tape feels active.
            </p>

            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-zinc-500">Effective</span>
              <span className="font-medium capitalize text-zinc-800 dark:text-zinc-200">
                {intensity}
                {status?.viewersActive ? " · viewers" : " · ambient"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Viewer boost
              </span>
              <div className="flex gap-1">
                {(["medium", "high"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    onClick={() => void applyBoost(option)}
                    className={`rounded px-2 py-1 text-[11px] font-medium capitalize transition ${
                      boost === option
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                        : "bg-zinc-100 text-zinc-500 hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runOnce()}
                className="h-8 rounded-md border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Run one tick
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearBook()}
                className="h-8 rounded-md border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Clear order book
              </button>
            </div>

            {message && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {message}
              </p>
            )}
            {status?.lastError && (
              <p className="text-[11px] text-red-600 dark:text-red-400">
                {status.lastError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
