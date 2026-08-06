"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { Check, Copy, Wallet, X } from "lucide-react";
import { SUPPORTED_TOKENS } from "@cex/solana";
import { buildTransferTransaction } from "@/lib/transfers";

type DepositModalProps = {
  depositAddress: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function DepositModal({
  depositAddress,
  open,
  onClose,
  onSuccess,
}: DepositModalProps) {
  if (!open) return null;
  return (
    <DepositForm
      depositAddress={depositAddress}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function DepositForm({
  depositAddress,
  onClose,
  onSuccess,
}: {
  depositAddress: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const [tokenName, setTokenName] = useState("SOL");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  async function handleDeposit() {
    setError(null);
    setStatus(null);

    if (!connected || !publicKey) {
      setVisible(true);
      return;
    }

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid amount");
      return;
    }

    setBusy(true);
    try {
      const to = new PublicKey(depositAddress);
      const tx = await buildTransferTransaction({
        connection,
        tokenName,
        amount: parsed,
        from: publicKey,
        to,
        feePayer: publicKey,
      });

      const signature = await sendTransaction(tx, connection);
      setStatus("Confirming…");
      await connection.confirmTransaction(signature, "confirmed");
      setStatus(`Deposited · ${signature.slice(0, 8)}…`);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-slate-950/90 p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl tracking-tight">Add Funds</h2>
            <p className="mt-1 text-sm text-white/60">
              Send from Phantom to your CEX deposit address
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-white/45">
            Deposit address
          </p>
          <button
            type="button"
            onClick={copyAddress}
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 px-3 py-2.5 text-left text-sm"
          >
            <span className="truncate font-mono text-white/90">
              {depositAddress}
            </span>
            {copied ? (
              <Check className="size-4 shrink-0 text-emerald-300" />
            ) : (
              <Copy className="size-4 shrink-0 text-white/50" />
            )}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {SUPPORTED_TOKENS.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setTokenName(t.name)}
              className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors ${
                tokenName === t.name
                  ? "border-white bg-white text-emerald-950"
                  : "border-white/15 bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-medium uppercase tracking-wide text-white/45">
            Amount
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/40"
          />
        </label>

        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        {status && <p className="mt-3 text-sm text-emerald-300">{status}</p>}

        <div className="mt-5 flex flex-col gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={() => setVisible(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-emerald-950 hover:bg-white/90"
            >
              <Wallet className="size-4" />
              Connect Phantom
            </button>
          ) : (
            <p className="text-center text-xs text-white/50">
              Connected · {publicKey?.toBase58().slice(0, 4)}…
              {publicKey?.toBase58().slice(-4)}
            </p>
          )}

          <button
            type="button"
            disabled={busy || !connected}
            onClick={handleDeposit}
            className="h-11 rounded-2xl border border-white/20 bg-white/15 text-sm font-semibold text-white transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Sending…" : `Deposit ${tokenName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
