"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { Check, Copy, Wallet, X } from "lucide-react";
import { buildSolTransfer } from "@/lib/transfers";

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
      const tx = await buildSolTransfer({
        connection,
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
        className="absolute inset-0 bg-zinc-950/40 dark:bg-zinc-950/70"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-zinc-950 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl tracking-tight">
              Deposit SOL
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Send Devnet SOL from Phantom to your CEX wallet
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Deposit address
          </p>
          <button
            type="button"
            onClick={copyAddress}
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <span className="truncate font-mono text-zinc-700 dark:text-zinc-300">
              {depositAddress}
            </span>
            {copied ? (
              <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="size-4 shrink-0 text-zinc-400" />
            )}
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Amount (SOL)
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="mt-2 h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-zinc-950 outline-none placeholder:text-zinc-300 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-600 dark:focus:border-zinc-500"
          />
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {status && (
          <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">
            {status}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={() => setVisible(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-950 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              <Wallet className="size-4" />
              Connect Phantom
            </button>
          ) : (
            <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
              Connected · {publicKey?.toBase58().slice(0, 4)}…
              {publicKey?.toBase58().slice(-4)}
            </p>
          )}

          <button
            type="button"
            disabled={busy || !connected}
            onClick={handleDeposit}
            className="h-10 rounded-md border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {busy ? "Sending…" : "Deposit SOL"}
          </button>
        </div>
      </div>
    </div>
  );
}
