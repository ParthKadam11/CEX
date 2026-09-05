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
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-1 py-20 sm:px-2">
        <p className="animate-fade-up text-sm font-medium tracking-wide text-zinc-500 dark:text-zinc-400">
          Spot exchange
        </p>
        <h1 className="animate-fade-up mt-4 font-display text-6xl leading-[0.95] tracking-tight text-zinc-950 sm:text-7xl dark:text-zinc-50">
          CEX
        </h1>
        <p className="animate-fade-up delay-100 mt-6 max-w-md text-lg leading-relaxed text-zinc-500 dark:text-zinc-400">
          Clear markets. Simple balances. Trade SOL-USD without the noise.
        </p>

        <div className="animate-fade-up delay-200 mt-10 flex flex-wrap items-center gap-3">
          {session?.user ? (
            <Button
              onClick={() => router.push("/dashboard")}
              className="h-10 rounded-md bg-zinc-950 px-5 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Open dashboard
            </Button>
          ) : (
            <Button
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="h-10 rounded-md bg-zinc-950 px-5 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              <GoogleIcon />
              Continue with Google
            </Button>
          )}
          <a
            href="#product"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            See how it works
          </a>
        </div>
      </section>

      <section
        id="product"
        className="border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/50"
      >
        <div className="mx-auto grid max-w-3xl gap-8 px-1 py-16 sm:grid-cols-3 sm:px-2">
          {[
            {
              title: "Balances",
              body: "Paper SOL and USD on the engine ledger — fund and trade.",
            },
            {
              title: "Trade",
              body: "Limit and market orders on SOL-USD with a live book.",
            },
            {
              title: "History",
              body: "Live tape, fills, and durable market data.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
