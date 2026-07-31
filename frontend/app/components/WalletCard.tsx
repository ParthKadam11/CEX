"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Check,
  Copy,
  CreditCard,
  Plus,
  Send,
} from "lucide-react";

const assetTabs = ["Tokens","Activity"] as const;

const actions = [
  { id: "send", label: "Send", icon: Send, primary: true },
  { id: "add", label: "Add Funds", icon: Plus, primary: false },
  { id: "withdraw", label: "Withdraw", icon: ArrowDownToLine, primary: false },
  { id: "swap", label: "Swap", icon: ArrowLeftRight, primary: false },
] as const;

type WalletCardProps = {
  publicKey: string | null;
  usdBalance: number;
};

export function WalletCard({ publicKey, usdBalance }: WalletCardProps) {
  const { data: session } = useSession();
  const [assetTab, setAssetTab] = useState<string>("Tokens");
  const [copied, setCopied] = useState(false);
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

  return (
    <div className="animate-fade-up w-full max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-white/15 bg-slate-950/25 backdrop-blur-lg">
        <div className="p-8">
          <div className="flex items-center gap-5">
            {image ? (
              <Image
                src={image}
                alt=""
                width={68}
                height={68}
                className="size-17 rounded-full ring-1 ring-white/25"
              />
            ) : (
              <div className="flex size-17 items-center justify-center rounded-full bg-white/15 text-lg font-semibold text-white ring-1 ring-white/25">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className="font-display text-4xl tracking-tight text-white [text-shadow:0_2px_24px_rgba(15,23,42,0.45)]">
              Welcome back, {name}!
            </h1>
          </div>

          <div className="mt-8 flex items-center gap-2 text-sm text-white/70">
            <CreditCard className="size-4" />
            CEX Account Assets
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-6xl font-bold tracking-tight text-white [text-shadow:0_2px_24px_rgba(15,23,42,0.45)]">
              ${usdBalance.toFixed(2)}
              <span className="ml-2 text-white/60">USD</span>
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

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {actions.map(({ id, label, primary }) => (
              <button
                key={id}
                type="button"
                className={`h-11 rounded-2xl text-sm font-semibold transition-colors ${
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

        <div className="px-8">
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

        <div className="flex flex-col items-center px-8 py-20 text-center">
          <h2 className="text-xl font-semibold text-white">
            You don&apos;t have any assets yet!
          </h2>
          <p className="mt-1 text-white/70">
            Start by buying or depositing funds:
          </p>
          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-emerald-950 transition-colors hover:bg-white/90"
          >
            <Plus className="size-4" />
            Add Funds
          </button>
        </div>
      </div>
    </div>
  );
}
