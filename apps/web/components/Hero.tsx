"use client";

import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/ui/googleButton";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export function Hero() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-20 sm:px-8">
        <p className="animate-fade-up text-sm font-medium tracking-wide text-zinc-500">
          Spot exchange
        </p>
        <h1 className="animate-fade-up mt-4 font-display text-6xl leading-[0.95] tracking-tight text-zinc-950 sm:text-7xl">
          CEX
        </h1>
        <p className="animate-fade-up delay-100 mt-6 max-w-md text-lg leading-relaxed text-zinc-500">
          Clear markets. Simple balances. Trade SOL-USD without the noise.
        </p>

        <div className="animate-fade-up delay-200 mt-10 flex flex-wrap items-center gap-3">
          {session?.user ? (
            <Button
              onClick={() => router.push("/dashboard")}
              className="h-10 rounded-md bg-zinc-950 px-5 text-white hover:bg-zinc-800"
            >
              Open dashboard
            </Button>
          ) : (
            <Button
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="h-10 rounded-md bg-zinc-950 px-5 text-white hover:bg-zinc-800"
            >
              <GoogleIcon />
              Continue with Google
            </Button>
          )}
          <a
            href="#product"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-950"
          >
            See how it works
          </a>
        </div>
      </section>

      <section
        id="product"
        className="border-t border-zinc-200 bg-zinc-50/70"
      >
        <div className="mx-auto grid max-w-3xl gap-8 px-5 py-16 sm:grid-cols-3 sm:px-8">
          {[
            {
              title: "Wallet",
              body: "Custodial Solana wallet with deposit and withdraw.",
            },
            {
              title: "Trade",
              body: "Limit orders and instant convert on SOL-USD.",
            },
            {
              title: "History",
              body: "Live book, balances, and durable market data.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h2 className="text-sm font-semibold text-zinc-950">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
