"use client";

import { useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  CreditCard,
  Plus,
  Send,
} from "lucide-react";

const assetTabs = ["Tokens", "NFTs", "Activity"] as const;

const actions = [
  { id: "send", label: "Send", icon: Send, primary: true },
  { id: "add", label: "Add Funds", icon: Plus, primary: false },
  { id: "withdraw", label: "Withdraw", icon: ArrowDownToLine, primary: false },
  { id: "swap", label: "Swap", icon: ArrowLeftRight, primary: false },
] as const;

type WalletCardProps = {
  publicKey: string | null;
  inrBalance: number;
};

export function WalletCard({ publicKey, inrBalance }: WalletCardProps) {
  const { data: session } = useSession();
  const [assetTab, setAssetTab] = useState<string>("Tokens");

  const name = session?.user?.name?.split(" ")[0] ?? "trader";
  const image = session?.user?.image;

  const shortKey = publicKey
    ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
    : "No wallet";

  return (
    <div className="w-full max-w-3xl">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <div className="p-8">
          <div className="flex items-center gap-5">
            {image ? (
              <Image
                src={image}
                alt=""
                width={68}
                height={68}
                className="size-17 rounded-full ring-1 ring-slate-200"
              />
            ) : (
              <div className="flex size-17 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-500 ring-1 ring-slate-200">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Welcome back, {name}!
            </h1>
          </div>

          <div className="mt-8 flex items-center gap-2 text-sm text-slate-500">
            <CreditCard className="size-4" />
            CEX Account Assets
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-6xl font-bold tracking-tight text-slate-900">
              {inrBalance.toFixed(2)}
              <span className="ml-2 text-slate-400">INR</span>
            </p>

            <button
              type="button"
              title={publicKey ?? undefined}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-200"
            >
              <CreditCard className="size-4" />
              {shortKey}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {actions.map(({ id, label, primary }) => (
              <button
                key={id}
                type="button"
                className={`h-11 rounded-lg text-sm font-semibold transition-colors ${
                  primary
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-8">
          <div className="flex gap-6 border-b border-slate-200">
            {assetTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setAssetTab(tab)}
                className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                  assetTab === tab
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center px-8 py-20 text-center">
          <h2 className="text-xl font-bold text-slate-900">
            You don&apos;t have any assets yet!
          </h2>
          <p className="mt-1 text-slate-500">
            Start by buying or depositing funds:
          </p>
          <button
            type="button"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="size-4" />
            Add Funds
          </button>
        </div>
      </div>
    </div>
  );
}
