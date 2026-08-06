"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet, X } from "lucide-react";
import { SUPPORTED_TOKENS } from "@cex/solana";
import axios from "axios";

type WithdrawModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function WithdrawModal({ open, onClose, onSuccess }: WithdrawModalProps) {
  if (!open) return null;
  return <WithdrawForm onClose={onClose} onSuccess={onSuccess} />;
}

function WithdrawForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const suggestedDestination = publicKey?.toBase58() ?? "";

  const [tokenName, setTokenName] = useState("SOL");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState(suggestedDestination);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destinationValue = destination || suggestedDestination;

  async function handleWithdraw() {
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
    if (!destinationValue.trim()) {
      setError("Enter a destination address");
      return;
    }

    setBusy(true);
    try {
      const { data } = await axios.post<{ signature: string }>("/api/withdraw", {
        token: tokenName,
        amount: parsed,
        destination: destinationValue.trim(),
      });
      setStatus(`Withdrawn · ${data.signature.slice(0, 8)}…`);
      onSuccess?.();
    } catch (e) {
      const message =
        axios.isAxiosError(e) && e.response?.data?.error
          ? String(e.response.data.error)
          : e instanceof Error
            ? e.message
            : "Withdraw failed";
      setError(message);
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
            <h2 className="font-display text-2xl tracking-tight">Withdraw</h2>
            <p className="mt-1 text-sm text-white/60">
              Send from your CEX wallet to Phantom (or any address)
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
            Destination
          </span>
          <input
            type="text"
            value={destinationValue}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Solana address"
            className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
          />
        </label>

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
            onClick={handleWithdraw}
            className="h-11 rounded-2xl border border-white/20 bg-white/15 text-sm font-semibold text-white transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Sending…" : `Withdraw ${tokenName}`}
          </button>
        </div>
      </div>
    </div>
  );
}
