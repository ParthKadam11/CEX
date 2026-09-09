"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type DepositAddress = {
  publicKey: string;
  cluster: string;
  explorerUrl: string;
  faucetUrl: string | null;
};

type DepositRow = {
  id: string;
  signature: string;
  lamports: string;
  lots: number;
  status: string;
  explorerUrl: string;
  failureReason: string | null;
  createdAt: string;
  creditedAt: string | null;
};

type SolDepositPanelProps = {
  exchangeSolAvailable: number;
  exchangeSolLocked?: number;
  paperUsdAvailable: number;
  paperUsdLocked?: number;
  className?: string;
  compact?: boolean;
};

export function SolDepositPanel({
  exchangeSolAvailable,
  exchangeSolLocked = 0,
  paperUsdAvailable,
  paperUsdLocked = 0,
  className,
  compact = false,
}: SolDepositPanelProps) {
  const [address, setAddress] = useState<DepositAddress | null>(null);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [addrRes, depRes] = await Promise.all([
      fetch("/api/solana/deposit-address", { cache: "no-store" }),
      fetch("/api/solana/deposits?limit=8", { cache: "no-store" }),
    ]);

    if (addrRes.ok) {
      const body = (await addrRes.json()) as DepositAddress & {
        ok?: boolean;
      };
      setAddress({
        publicKey: body.publicKey,
        cluster: body.cluster,
        explorerUrl: body.explorerUrl,
        faucetUrl: body.faucetUrl,
      });
      setError("");
    } else {
      const body = (await addrRes.json().catch(() => ({}))) as {
        error?: { message?: string; code?: string };
      };
      setError(
        body.error?.message ??
          body.error?.code ??
          "Could not load Devnet deposit address",
      );
    }

    if (depRes.ok) {
      const body = (await depRes.json()) as {
        pending?: number;
        deposits?: DepositRow[];
      };
      setPending(body.pending ?? 0);
      setDeposits(Array.isArray(body.deposits) ? body.deposits : []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const kick = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function copyAddress() {
    if (!address?.publicKey) return;
    try {
      await navigator.clipboard.writeText(address.publicKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setError("Clipboard copy failed");
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border border-zinc-200 dark:border-zinc-800",
        compact ? "px-3 py-2.5" : "p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
            Devnet deposit
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Send Solana Devnet SOL → exchange balance
          </p>
        </div>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          Devnet
        </span>
      </div>

      <div
        className={cn(
          "mt-3 grid gap-2 text-[11px] tabular-nums",
          compact ? "grid-cols-1" : "sm:grid-cols-2",
        )}
      >
        <BalanceLine
          label="Exchange SOL"
          available={exchangeSolAvailable}
          locked={exchangeSolLocked}
          hint="on-chain backed"
        />
        <BalanceLine
          label="Paper USD"
          available={paperUsdAvailable}
          locked={paperUsdLocked}
          hint="quote currency"
        />
      </div>

      {loading && !address ? (
        <p className="mt-3 text-[11px] text-zinc-400">Loading address…</p>
      ) : address ? (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
            Deposit address
          </p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5 font-mono text-[11px] text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              {address.publicKey}
            </code>
            <button
              type="button"
              onClick={() => void copyAddress()}
              className="shrink-0 rounded border border-zinc-200 px-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px]">
            {address.faucetUrl ? (
              <a
                href={address.faucetUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-zinc-950 underline-offset-2 hover:underline dark:text-zinc-50"
              >
                Devnet faucet
              </a>
            ) : null}
            <a
              href={address.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              Explorer
            </a>
            {pending > 0 ? (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {pending} pending
              </span>
            ) : (
              <span className="text-zinc-400">No pending deposits</span>
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {deposits.length > 0 ? (
        <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <p className="mb-1.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
            Recent deposits
          </p>
          <ul className="space-y-1.5">
            {deposits.slice(0, compact ? 3 : 6).map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <a
                  href={row.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate font-mono text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
                  title={row.signature}
                >
                  {row.signature.slice(0, 8)}…
                </a>
                <span className="shrink-0 tabular-nums text-zinc-800 dark:text-zinc-200">
                  {row.lots} SOL
                </span>
                <StatusPill status={row.status} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BalanceLine({
  label,
  available,
  locked,
  hint,
}: {
  label: string;
  available: number;
  locked: number;
  hint: string;
}) {
  return (
    <div className="rounded border border-zinc-100 px-2.5 py-2 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-zinc-500">{label}</span>
        <span className="text-[10px] text-zinc-400">{hint}</span>
      </div>
      <p className="mt-0.5 font-medium tabular-nums text-zinc-950 dark:text-zinc-50">
        {available.toLocaleString()}
        {locked > 0 ? (
          <span className="font-normal text-zinc-400">
            {" "}
            / {locked.toLocaleString()} locked
          </span>
        ) : null}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "CREDITED"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "FAILED" || status === "IGNORED"
        ? "text-red-600 dark:text-red-400"
        : "text-amber-700 dark:text-amber-400";
  return (
    <span className={cn("shrink-0 font-medium capitalize", tone)}>
      {status.toLowerCase()}
    </span>
  );
}
