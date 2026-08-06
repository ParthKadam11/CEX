"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Plus,
  Send,
} from "lucide-react";
import { useSolBalance } from "@/hooks/useSolBalance";
import { useActivity } from "@/hooks/useActivity";
import { DepositModal } from "@/components/DepositModal";
import { WithdrawModal } from "@/components/WithdrawModal";

const assetTabs = ["Wallet", "Activity"] as const;

type WalletCardProps = {
  publicKey: string | null;
  /** Simulated USD (DB only — not depositable/withdrawable). */
  usdBalance: number;
};

export function WalletCard({ publicKey, usdBalance }: WalletCardProps) {
  const { data: session } = useSession();
  const { loading, balance, error, refetch } = useSolBalance(publicKey ?? "");
  const [assetTab, setAssetTab] = useState<string>("Wallet");
  const {
    loading: activityLoading,
    activities,
    error: activityError,
  } = useActivity(publicKey ?? "", assetTab === "Activity");
  const [copied, setCopied] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const name = session?.user?.name?.split(" ")[0] ?? "trader";
  const image = session?.user?.image;

  const shortKey = publicKey
    ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
    : "No wallet";

  const actions = [
    {
      id: "send",
      label: "Send",
      icon: Send,
      primary: true,
      onClick: () => setWithdrawOpen(true),
      disabled: !publicKey,
    },
    {
      id: "add",
      label: "Deposit",
      icon: Plus,
      primary: false,
      onClick: () => setDepositOpen(true),
      disabled: !publicKey,
    },
    {
      id: "withdraw",
      label: "Withdraw",
      icon: ArrowDownToLine,
      primary: false,
      onClick: () => setWithdrawOpen(true),
      disabled: !publicKey,
    },
  ] as const;

  async function copyAddress() {
    if (!publicKey) return;

    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);

      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
      resetTimer.current = setTimeout(() => setCopied(false), 1000);
    } catch {
      setCopied(false);
    }
  }

  function handleFundsMoved() {
    setTimeout(() => refetch(), 1500);
  }

  return (
    <>
      <div className="animate-fade-up w-full max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-white/15 bg-slate-950/60 backdrop-blur-3xl">
          <div className="p-6">
            <div className="flex items-center gap-4">
              {image ? (
                <Image
                  src={image}
                  alt=""
                  width={56}
                  height={56}
                  className="size-14 rounded-full ring-1 ring-white/25"
                />
              ) : (
                <div className="flex size-14 items-center justify-center rounded-full bg-white/15 text-lg font-semibold text-white ring-1 ring-white/25">
                  {name.charAt(0).toUpperCase()}
                </div>
              )}
              <h1 className="font-display text-3xl tracking-tight text-white [text-shadow:0_2px_24px_rgba(15,23,42,0.45)]">
                Welcome back, {name}!
              </h1>
            </div>

            <div className="mt-6 flex items-center gap-2 text-sm text-white/70">
              <CreditCard className="size-4" />
              CEX Devnet Wallet
            </div>

            <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
              <p className="text-5xl font-bold tracking-tight text-white [text-shadow:0_2px_24px_rgba(15,23,42,0.45)]">
                {loading ? (
                  <span className="text-white/50">...</span>
                ) : (
                  <>
                    {(balance ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })}
                    <span className="ml-2 text-white/60">SOL</span>
                  </>
                )}
              </p>

              <button
                type="button"
                onClick={copyAddress}
                disabled={!publicKey}
                title={publicKey ?? undefined}
                aria-label={
                  publicKey ? `Copy wallet address ${publicKey}` : "No wallet"
                }
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/15 px-4 py-2 text-sm text-white transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white/15"
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? "Copied!" : shortKey}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {actions.map(({ id, label, primary, onClick, disabled }) => (
                <button
                  key={id}
                  type="button"
                  onClick={onClick}
                  disabled={disabled}
                  className={`h-10 rounded-2xl text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    primary
                      ? "bg-white text-emerald-950 hover:bg-white/90"
                      : "border border-white/20 bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6">
            <div className="flex gap-6 border-b border-white/15">
              {assetTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAssetTab(tab)}
                  className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                    assetTab === tab
                      ? "border-white text-white"
                      : "border-transparent text-white/50 hover:text-white/80"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 py-6">
            {assetTab === "Wallet" && (
              <>
                {loading ? (
                  <p className="py-6 text-center text-sm text-white/60">
                    Loading balance...
                  </p>
                ) : error ? (
                  <p className="py-6 text-center text-sm text-rose-300">
                    {error}
                  </p>
                ) : (
                  <ul className="divide-y divide-white/10">
                    <li className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="font-semibold text-white">SOL</p>
                        <p className="text-sm text-white/50">
                          Devnet · deposit & withdraw
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-white">
                          {(balance ?? 0).toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })}
                        </p>
                        <p className="text-sm text-white/50">Available</p>
                      </div>
                    </li>
                    <li className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="font-semibold text-white">USD</p>
                        <p className="text-sm text-white/50">
                          Simulated · quote currency
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-white">
                          {usdBalance.toLocaleString()}
                        </p>
                        <p className="text-sm text-white/50">Available</p>
                      </div>
                    </li>
                  </ul>
                )}

                {!loading && !error && (balance ?? 0) === 0 && (
                  <div className="mt-4 flex flex-col items-center border-t border-white/10 pt-4 text-center">
                    <p className="text-sm text-white/70">
                      Deposit Devnet SOL from Phantom to start trading later
                    </p>
                    <button
                      type="button"
                      disabled={!publicKey}
                      onClick={() => setDepositOpen(true)}
                      className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-white/90 disabled:opacity-50"
                    >
                      <Plus className="size-4" />
                      Deposit SOL
                    </button>
                  </div>
                )}
              </>
            )}

            {assetTab === "Activity" && (
              <>
                {activityLoading ? (
                  <p className="py-6 text-center text-sm text-white/60">
                    Loading activity...
                  </p>
                ) : activityError ? (
                  <p className="py-6 text-center text-sm text-rose-300">
                    {activityError}
                  </p>
                ) : activities && activities.length > 0 ? (
                  <ul className="divide-y divide-white/10">
                    {activities.map((item) => {
                      const when = item.blockTime
                        ? new Date(item.blockTime * 1000).toLocaleString()
                        : "Unknown time";
                      const label =
                        item.direction === "in"
                          ? "Received"
                          : item.direction === "out"
                            ? "Sent"
                            : "Transaction";
                      const Icon =
                        item.direction === "in"
                          ? ArrowDownLeft
                          : item.direction === "out"
                            ? ArrowUpRight
                            : ExternalLink;

                      return (
                        <li
                          key={item.signature}
                          className="flex items-center justify-between gap-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-full bg-white/10">
                              <Icon className="size-4 text-white/80" />
                            </div>
                            <div>
                              <p className="font-semibold text-white">
                                {label}
                                {item.status === "failed" ? " (failed)" : ""}
                              </p>
                              <p className="text-sm text-white/50">{when}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p
                              className={`font-semibold ${
                                item.direction === "in"
                                  ? "text-emerald-300"
                                  : item.direction === "out"
                                    ? "text-white"
                                    : "text-white/80"
                              }`}
                            >
                              {item.amount != null
                                ? `${item.direction === "in" ? "+" : item.direction === "out" ? "−" : ""}${item.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
                                : item.shortSignature}
                            </p>
                            <a
                              href={item.explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white"
                            >
                              {item.shortSignature}
                              <ExternalLink className="size-3" />
                            </a>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-white/60">
                    No recent activity
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {publicKey && (
        <>
          <DepositModal
            depositAddress={publicKey}
            open={depositOpen}
            onClose={() => setDepositOpen(false)}
            onSuccess={handleFundsMoved}
          />
          <WithdrawModal
            open={withdrawOpen}
            onClose={() => setWithdrawOpen(false)}
            onSuccess={handleFundsMoved}
          />
        </>
      )}
    </>
  );
}
