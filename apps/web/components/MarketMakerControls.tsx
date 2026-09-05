"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Settings2, X } from "lucide-react";
import type { OrderBookSnapshot } from "@cex/exchange-types";

const MAX_EVENTS = 40;

const SPEED_OPTIONS = [
  { id: "fast", label: "Fast", ms: 250 },
  { id: "normal", label: "Normal", ms: 500 },
  { id: "slow", label: "Slow", ms: 1200 },
] as const;

const INTENSITY_OPTIONS = ["low", "medium", "high"] as const;

type TickResult = {
  mid?: number;
  placed?: number;
  traded?: boolean;
  seeded?: boolean;
  ticks?: number;
  book?: OrderBookSnapshot | null;
  prints?: { price: number; quantity: number }[];
  error?: { message?: string };
};

type SimEvent = {
  id: string;
  at: number;
  text: string;
  tone?: "ok" | "warn" | "err";
};

type MarketMakerControlsProps = {
  onTickAction?: (result: TickResult) => void;
};

/**
 * Simulation menu: switch + speed/intensity/mode controls + event log.
 * Trigger shows a clear SIM indicator when running.
 */
export function MarketMakerControls({ onTickAction }: MarketMakerControlsProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [speedId, setSpeedId] = useState<(typeof SPEED_OPTIONS)[number]["id"]>(
    "normal",
  );
  const [intensity, setIntensity] =
    useState<(typeof INTENSITY_OPTIONS)[number]>("medium");
  const [placeQuotes, setPlaceQuotes] = useState(true);
  const [placeTrades, setPlaceTrades] = useState(true);
  const [spread, setSpread] = useState(2);

  const runningRef = useRef(false);
  const onTickRef = useRef(onTickAction);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef({
    speedId,
    intensity,
    placeQuotes,
    placeTrades,
    spread,
  });

  onTickRef.current = onTickAction;
  optionsRef.current = {
    speedId,
    intensity,
    placeQuotes,
    placeTrades,
    spread,
  };

  useEffect(() => {
    return () => {
      runningRef.current = false;
    };
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

  function pushEvent(text: string, tone: SimEvent["tone"] = "ok") {
    setEvents((current) =>
      [
        { id: `${Date.now()}-${Math.random()}`, at: Date.now(), text, tone },
        ...current,
      ].slice(0, MAX_EVENTS),
    );
  }

  async function tick(): Promise<boolean> {
    setBusy(true);
    const opts = optionsRef.current;
    try {
      const response = await fetch("/api/sim/market-maker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "tick",
          placeQuotes: opts.placeQuotes,
          placeTrades: opts.placeTrades,
          intensity: opts.intensity,
          spread: opts.spread,
        }),
      });
      const body = (await response.json()) as TickResult;
      if (!response.ok) {
        pushEvent(body.error?.message ?? "Sim tick failed", "err");
        return false;
      }
      onTickRef.current?.(body);
      const parts = [
        `mid ${body.mid}`,
        `+${body.placed ?? 0} orders`,
        body.seeded ? "seeded book" : null,
        body.traded ? `${body.prints?.length ?? 0} print(s)` : null,
      ].filter(Boolean);
      pushEvent(parts.join(" · "), body.traded ? "ok" : "warn");
      return true;
    } catch {
      pushEvent("Sim unavailable — is gateway up?", "err");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function loop() {
    while (runningRef.current) {
      const ok = await tick();
      if (!runningRef.current) break;
      if (!ok) {
        await sleep(800);
        continue;
      }
      const speed =
        SPEED_OPTIONS.find((s) => s.id === optionsRef.current.speedId)?.ms ??
        500;
      await sleep(speed);
    }
  }

  function start() {
    if (runningRef.current) return;
    if (!placeQuotes && !placeTrades) {
      pushEvent("Enable quotes and/or trades first", "err");
      return;
    }
    runningRef.current = true;
    setRunning(true);
    pushEvent("Simulation started");
    void loop();
  }

  function stop() {
    runningRef.current = false;
    setRunning(false);
    pushEvent("Simulation stopped", "warn");
  }

  function toggle() {
    if (running) stop();
    else start();
  }

  async function runOnce() {
    pushEvent("Manual tick");
    await tick();
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      {running && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-50 px-2 py-1 text-[11px] font-semibold tracking-wide text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-950/50 dark:text-emerald-400">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          SIM
        </span>
      )}

      <button
        type="button"
        aria-label="Simulation settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex size-8 items-center justify-center rounded-md border transition ${
          running
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
                  Simulator
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  Market makers & retail flow
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={running}
              aria-label="Toggle market simulation"
              onClick={toggle}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                running ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  running ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="space-y-3 border-b border-zinc-100 px-3 py-3 dark:border-zinc-800">
            <ControlRow label="Speed">
              <div className="flex gap-1">
                {SPEED_OPTIONS.map((option) => (
                  <Chip
                    key={option.id}
                    active={speedId === option.id}
                    onClick={() => setSpeedId(option.id)}
                    label={option.label}
                  />
                ))}
              </div>
            </ControlRow>

            <ControlRow label="Intensity">
              <div className="flex gap-1">
                {INTENSITY_OPTIONS.map((option) => (
                  <Chip
                    key={option}
                    active={intensity === option}
                    onClick={() => setIntensity(option)}
                    label={option}
                  />
                ))}
              </div>
            </ControlRow>

            <ControlRow label="Spread">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={spread}
                  onChange={(e) => setSpread(Number(e.target.value))}
                  className="h-1 w-24 accent-zinc-700 dark:accent-zinc-300"
                />
                <span className="w-4 text-[11px] tabular-nums text-zinc-500">
                  {spread}
                </span>
              </div>
            </ControlRow>

            <div className="flex flex-wrap gap-3 text-[11px]">
              <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={placeQuotes}
                  onChange={(e) => setPlaceQuotes(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                Place quotes
              </label>
              <label className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={placeTrades}
                  onChange={(e) => setPlaceTrades(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                Place trades
              </label>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void runOnce()}
              className="h-8 w-full rounded-md border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Run one tick
            </button>
          </div>

          <div className="px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Recent events
              </p>
              {busy && running && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  ticking…
                </span>
              )}
            </div>
            <div className="ob-scroll max-h-40 space-y-1.5 pr-1">
              {events.length === 0 ? (
                <p className="py-5 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
                  Turn on the switch or run one tick.
                </p>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/70"
                  >
                    <p
                      className={`text-[11px] leading-snug ${
                        event.tone === "err"
                          ? "text-red-600 dark:text-red-400"
                          : event.tone === "warn"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-zinc-700 dark:text-zinc-200"
                      }`}
                    >
                      {event.text}
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                      {new Date(event.at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ControlRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-[11px] font-medium capitalize transition ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
          : "bg-zinc-100 text-zinc-500 hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
