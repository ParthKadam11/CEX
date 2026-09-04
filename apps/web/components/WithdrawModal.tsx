"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet, X } from "lucide-react";
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
        className="absolute inset-0 bg-zinc-950/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-zinc-950 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl tracking-tight">
              Withdraw SOL
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Send Devnet SOL from your CEX wallet to Phantom
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-500">Destination</span>
          <input
            type="text"
            value={destinationValue}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Solana address"
            className="mt-2 h-10 w-full rounded-md border border-zinc-200 px-3 font-mono text-sm text-zinc-950 outline-none placeholder:text-zinc-300 focus:border-zinc-400"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-500">Amount (SOL)</span>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="mt-2 h-10 w-full rounded-md border border-zinc-200 px-3 text-zinc-950 outline-none placeholder:text-zinc-300 focus:border-zinc-400"
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {status && <p className="mt-3 text-sm text-emerald-600">{status}</p>}

        <div className="mt-5 flex flex-col gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={() => setVisible(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-950 text-sm font-medium text-white hover:bg-zinc-800"
            >
              <Wallet className="size-4" />
              Connect Phantom
            </button>
          ) : (
            <p className="text-center text-xs text-zinc-400">
              Connected · {publicKey?.toBase58().slice(0, 4)}…
              {publicKey?.toBase58().slice(-4)}
            </p>
          )}

          <button
            type="button"
            disabled={busy || !connected}
            onClick={handleWithdraw}
            className="h-10 rounded-md border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            {busy ? "Sending…" : "Withdraw SOL"}
          </button>
        </div>
      </div>
    </div>
  );
}
