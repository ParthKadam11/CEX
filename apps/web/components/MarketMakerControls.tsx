"use client";

import { useEffect, useRef, useState } from "react";
import type { OrderBookSnapshot } from "@cex/exchange-types";

const TICK_GAP_MS = 350;

type TickResult = {
  mid?: number;
  placed?: number;
  traded?: boolean;
  seeded?: boolean;
  ticks?: number;
  book?: OrderBookSnapshot | null;
  error?: { message?: string };
};

type MarketMakerControlsProps = {
  onTickAction?: (result: TickResult) => void;
};

/**
 * Simulation switch. Browser owns a tight non-overlapping loop;
 * each tick injects engine commands and pushes the fresh book into the UI.
 */
export function MarketMakerControls({ onTickAction }: MarketMakerControlsProps) {
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const runningRef = useRef(false);
  const onTickRef = useRef(onTickAction);
  onTickRef.current = onTickAction;

  useEffect(() => {
    return () => {
      runningRef.current = false;
    };
  }, []);

  async function tick(): Promise<boolean> {
    setBusy(true);
    try {
      const response = await fetch("/api/sim/market-maker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "tick" }),
      });
      const body = (await response.json()) as TickResult;
      if (!response.ok) {
        setStatus(body.error?.message ?? "Sim tick failed");
        return false;
      }
      onTickRef.current?.(body);
      const parts = [
        `mid ${body.mid}`,
        `+${body.placed ?? 0}`,
        body.seeded ? "seed" : null,
        body.traded ? "prints" : null,
        `t${body.ticks ?? 0}`,
      ].filter(Boolean);
      setStatus(parts.join(" · "));
      return true;
    } catch {
      setStatus("Sim unavailable — is gateway up?");
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
        // Back off briefly on failure, keep trying while switch is on
        await sleep(800);
        continue;
      }
      await sleep(TICK_GAP_MS);
    }
  }

  function start() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setStatus("Starting…");
    void loop();
  }

  function stop() {
    runningRef.current = false;
    setRunning(false);
    setStatus("Stopped");
  }

  function toggle() {
    if (running) stop();
    else start();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2.5 select-none">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Simulation
        </span>
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
      </label>
      {status && (
        <span
          className={`text-[11px] tabular-nums ${
            running
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          {busy && running ? "⚡ " : ""}
          {status}
        </span>
      )}
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
