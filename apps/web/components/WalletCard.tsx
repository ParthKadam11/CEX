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
};

export function WalletCard({ publicKey }: WalletCardProps) {
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
      if (resetTimer.current) clearTimeout(resetTimer.current);
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
      if (resetTimer.current) clearTimeout(resetTimer.current);
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
      <div className="animate-fade-up w-full max-w-2xl">
        <div className="flex items-center gap-3">
          {image ? (
            <Image
              src={image}
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full"
            />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-700">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm text-zinc-500">Welcome back</p>
            <h1 className="font-display text-2xl tracking-tight text-zinc-950">
              {name}
            </h1>
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-200 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-500">SOL balance</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
                {loading ? (
                  <span className="text-zinc-300">…</span>
                ) : (
                  (balance ?? 0).toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={copyAddress}
              disabled={!publicKey}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : shortKey}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            {actions.map(({ id, label, primary, onClick, disabled }) => (
              <button
                key={id}
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={`h-9 rounded-md text-sm font-medium transition disabled:opacity-40 ${
                  primary
                    ? "bg-zinc-950 text-white hover:bg-zinc-800"
                    : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <div className="flex gap-5 border-b border-zinc-200">
            {assetTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setAssetTab(tab)}
                className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition ${
                  assetTab === tab
                    ? "border-zinc-950 text-zinc-950"
                    : "border-transparent text-zinc-400 hover:text-zinc-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="py-6">
            {assetTab === "Wallet" && (
              <>
                {loading ? (
                  <p className="py-8 text-center text-sm text-zinc-400">
                    Loading balance…
                  </p>
                ) : error ? (
                  <p className="py-8 text-center text-sm text-red-600">{error}</p>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    <li className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-zinc-950">SOL</p>
                        <p className="text-sm text-zinc-400">Devnet</p>
                      </div>
                      <p className="font-medium text-zinc-950">
                        {(balance ?? 0).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}
                      </p>
                    </li>
                    <li className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-zinc-950">USD</p>
                        <p className="text-sm text-zinc-400">Trading balance</p>
                      </div>
                      <p className="text-sm text-zinc-400">View on Trade</p>
                    </li>
                  </ul>
                )}

                {!loading && !error && (balance ?? 0) === 0 && (
                  <div className="mt-4 border-t border-zinc-100 pt-6 text-center">
                    <p className="text-sm text-zinc-500">
                      Deposit Devnet SOL to get started
                    </p>
                    <button
                      type="button"
                      disabled={!publicKey}
                      onClick={() => setDepositOpen(true)}
                      className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                      Deposit SOL
                    </button>
                  </div>
                )}
              </>
            )}

            {assetTab === "Activity" && (
              <>
                {activityLoading ? (
                  <p className="py-8 text-center text-sm text-zinc-400">
                    Loading activity…
                  </p>
                ) : activityError ? (
                  <p className="py-8 text-center text-sm text-red-600">
                    {activityError}
                  </p>
                ) : activities && activities.length > 0 ? (
                  <ul className="divide-y divide-zinc-100">
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
                            <div className="flex size-8 items-center justify-center rounded-full bg-zinc-100">
                              <Icon className="size-3.5 text-zinc-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-zinc-950">
                                {label}
                                {item.status === "failed" ? " (failed)" : ""}
                              </p>
                              <p className="text-xs text-zinc-400">{when}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-zinc-950">
                              {item.amount != null
                                ? `${item.direction === "in" ? "+" : item.direction === "out" ? "−" : ""}${item.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
                                : item.shortSignature}
                            </p>
                            <a
                              href={item.explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700"
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
                  <p className="py-8 text-center text-sm text-zinc-400">
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
