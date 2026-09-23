"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/ui/googleButton";
import { useTheme } from "@/components/ThemeProvider";
import { ExternalLink, Moon, Sun } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const TAGLINE_WORDS = [
  "Trade",
  "SOL",
  "USD",
  "spot",
  "and",
  "perps",
  "with",
  "balances",
  "you",
  "can",
  "read",
  "at",
  "a",
  "glance.",
];

const TAPE_ROWS = [
  { side: "buy", qty: "12.40", price: "148.32" },
  { side: "sell", qty: "4.10", price: "148.35" },
  { side: "buy", qty: "0.85", price: "148.29" },
  { side: "buy", qty: "22.00", price: "148.27" },
  { side: "sell", qty: "7.65", price: "148.38" },
  { side: "buy", qty: "3.20", price: "148.31" },
  { side: "sell", qty: "1.50", price: "148.40" },
  { side: "buy", qty: "9.75", price: "148.28" },
] as const;

const BOOK_ASKS = [
  { price: "148.42", size: "4.20", total: 48.5 },
  { price: "148.39", size: "9.40", total: 44.3 },
  { price: "148.36", size: "14.10", total: 34.9 },
  { price: "148.35", size: "20.80", total: 20.8 },
] as const;

const BOOK_BIDS = [
  { price: "148.32", size: "18.50", total: 18.5 },
  { price: "148.30", size: "12.10", total: 30.6 },
  { price: "148.27", size: "8.25", total: 38.85 },
  { price: "148.24", size: "15.60", total: 54.45 },
] as const;

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );
}

function AuthCta({
  session,
  onDashboard,
  className,
}: {
  session: ReturnType<typeof useSession>["data"];
  onDashboard: () => void;
  className?: string;
}) {
  if (session?.user) {
    return (
      <Button onClick={onDashboard} className={className}>
        Open dashboard
      </Button>
    );
  }

  return (
    <Button
      onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      className={className}
    >
      <GoogleIcon />
      Continue with Google
    </Button>
  );
}

export function Hero() {
  const { data: session } = useSession();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const openDashboard = () => router.push("/dashboard");

  return (
    <main className="min-h-full bg-[#eef4f0] dark:bg-background">
      <section className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-black">
        <Image
          src="/financeBg.jpg"
          alt=""
          fill
          priority
          quality={90}
          sizes="100vw"
          className="animate-hero-zoom object-cover object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.48)_0%,rgba(0,0,0,0.16)_42%,rgba(0,0,0,0.72)_100%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_35%,rgba(0,0,0,0.32)_0%,transparent_55%)]"
        />

        <header className="relative z-10 flex items-center justify-between px-4 pt-5 sm:px-8 sm:pt-6">
          <nav className="flex items-center gap-5 text-sm font-medium text-white/70">
            <a
              href="#markets"
              className="transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-white"
            >
              Markets
            </a>
            <a
              href="#app"
              className="hidden transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-white sm:inline"
            >
              App
            </a>
            <a
              href="#desk"
              className="hidden transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-white sm:inline"
            >
              Desk
            </a>
            <a
              href="#product"
              className="transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-white"
            >
              Product
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              className="inline-flex size-10 items-center justify-center rounded-md text-white/70 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/10 hover:text-white"
            >
              {theme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
            <a
              href="https://github.com/ParthKadam11/CEX"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 text-sm font-medium text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              GitHub
            </a>
            {session?.user ? (
              <Button
                onClick={openDashboard}
                className="h-10 rounded-md bg-white px-4 text-base font-semibold text-zinc-950 hover:bg-white/90"
              >
                Dashboard
              </Button>
            ) : (
              <Button
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                variant="outline"
                className="h-10 rounded-md border-white/25 bg-white/10 px-4 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
              >
                Sign in
              </Button>
            )}
          </div>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-8 pt-12 sm:px-8">
          <div className="max-w-[680px]">
            <p className="animate-fade-up inline-flex items-center gap-1.5 border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] tracking-[0.16em] text-emerald-300 uppercase backdrop-blur-sm">
              PaperTrade
              <span className="text-emerald-300/50">·</span>
              No real funds
            </p>
            <h1 className="animate-fade-up delay-100 mt-5 font-display text-balance text-7xl leading-none tracking-tight text-white sm:text-8xl md:text-9xl">
              Paper Trade
            </h1>
            <p className="animate-fade-up delay-200 mt-6 max-w-md text-pretty text-lg leading-relaxed text-white/75">
              Clear paper markets for SOL USD. Spot and perpetual trading without
              the clutter, wallets, or real capital at risk.
            </p>

            <div className="animate-fade-up delay-200 mt-10 flex flex-wrap items-center gap-3">
              <AuthCta
                session={session}
                onDashboard={openDashboard}
                className="h-11 rounded-md bg-white px-5 text-base font-semibold text-zinc-950 hover:bg-white/90 active:scale-[0.98]"
              />
              <a
                href="#app"
                className="inline-flex h-11 items-center px-2 text-sm font-medium text-white/70 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-white"
              >
                See the app
              </a>
            </div>
          </div>

          <div className="animate-fade-up delay-200 mt-14 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Last", value: "148.32", tone: "text-white" },
              { label: "24h", value: "+2.14%", tone: "text-emerald-300" },
              { label: "Markets", value: "Spot · Perps", tone: "text-white" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="border border-white/20 bg-zinc-950/85 px-4 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
              >
                <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-400 uppercase">
                  {stat.label}
                </p>
                <p
                  className={`mt-1.5 font-mono text-xl tabular-nums tracking-tight ${stat.tone}`}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 border-t border-white/10 bg-black/50 backdrop-blur-md">
          <div className="overflow-hidden py-3">
            <div className="animate-tape-scroll flex w-max gap-8 px-4 font-mono text-xs tabular-nums text-white/70 sm:text-sm">
              {[...TAPE_ROWS, ...TAPE_ROWS].map((row, index) => (
                <span key={`${row.price}-${index}`} className="flex gap-3">
                  <span className="text-white/40">SOL-USD</span>
                  <span
                    className={
                      row.side === "buy" ? "text-emerald-300" : "text-rose-300"
                    }
                  >
                    {row.side.toUpperCase()}
                  </span>
                  <span>{row.qty}</span>
                  <span className="text-white">@{row.price}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <TaglineReveal />

      <ProductShot />

      <section
        id="markets"
        className="relative isolate overflow-hidden border-t border-emerald-900/10 bg-[#e8f0ea] dark:border-border dark:bg-background"
      >
        <SectionWash />
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:px-8 sm:py-24">
          <p className="font-mono text-xs tracking-[0.18em] text-emerald-800/70 uppercase dark:text-muted-foreground">
            Markets
          </p>
          <h2 className="mt-3 max-w-xl text-balance font-display text-4xl leading-none text-zinc-950 sm:text-5xl dark:text-foreground">
            Two ways to trade the same pair.
          </h2>

          <div className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-5">
            <article className="border border-emerald-900/10 bg-[#f7fbf8] p-6 shadow-[0_18px_50px_rgba(15,40,28,0.06)] sm:p-8 dark:border-border dark:bg-transparent dark:shadow-none">
              <p className="font-mono text-[10px] tracking-[0.2em] text-emerald-700 uppercase dark:text-emerald-400">
                01 · Spot
              </p>
              <h3 className="mt-4 font-display text-3xl text-zinc-950 dark:text-foreground">
                SOL-USD
              </h3>
              <p className="mt-3 max-w-sm text-pretty text-base leading-relaxed text-zinc-600 dark:text-muted-foreground">
                Buy and sell against your ledger balances. Limit and market
                orders settle against a live book.
              </p>
              <dl className="mt-8 space-y-3 font-mono text-sm tabular-nums text-zinc-950 dark:text-foreground">
                <div className="flex justify-between border-t border-emerald-900/10 pt-3 dark:border-border">
                  <dt className="text-zinc-500 dark:text-muted-foreground">
                    Settlement
                  </dt>
                  <dd>Immediate</dd>
                </div>
                <div className="flex justify-between border-t border-emerald-900/10 pt-3 dark:border-border">
                  <dt className="text-zinc-500 dark:text-muted-foreground">
                    Orders
                  </dt>
                  <dd>Limit · Market</dd>
                </div>
                <div className="flex justify-between border-t border-emerald-900/10 pt-3 dark:border-border">
                  <dt className="text-zinc-500 dark:text-muted-foreground">
                    Collateral
                  </dt>
                  <dd>SOL · USD</dd>
                </div>
              </dl>
            </article>

            <article className="border border-rose-900/10 bg-[#fff8f8] p-6 shadow-[0_18px_50px_rgba(40,15,20,0.05)] sm:p-8 dark:border-border dark:bg-transparent dark:shadow-none">
              <p className="font-mono text-[10px] tracking-[0.2em] text-rose-700 uppercase dark:text-rose-400">
                02 · Perps
              </p>
              <h3 className="mt-4 font-display text-3xl text-zinc-950 dark:text-foreground">
                SOL-USD-PERP
              </h3>
              <p className="mt-3 max-w-sm text-pretty text-base leading-relaxed text-zinc-600 dark:text-muted-foreground">
                Leveraged perpetual exposure with marked prices, margin, and
                the same tape discipline as spot.
              </p>
              <dl className="mt-8 space-y-3 font-mono text-sm tabular-nums text-zinc-950 dark:text-foreground">
                <div className="flex justify-between border-t border-rose-900/10 pt-3 dark:border-border">
                  <dt className="text-zinc-500 dark:text-muted-foreground">
                    Exposure
                  </dt>
                  <dd>Long · Short</dd>
                </div>
                <div className="flex justify-between border-t border-rose-900/10 pt-3 dark:border-border">
                  <dt className="text-zinc-500 dark:text-muted-foreground">
                    Margin
                  </dt>
                  <dd>Isolated book</dd>
                </div>
                <div className="flex justify-between border-t border-rose-900/10 pt-3 dark:border-border">
                  <dt className="text-zinc-500 dark:text-muted-foreground">
                    Underlying
                  </dt>
                  <dd>SOL USD</dd>
                </div>
              </dl>
            </article>
          </div>
        </div>
      </section>

      <section id="desk" className="border-t border-border bg-zinc-950 text-zinc-50">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-8 sm:py-24">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs tracking-[0.18em] text-zinc-500 uppercase">
                Trading desk
              </p>
              <h2 className="mt-3 max-w-xl text-balance font-display text-4xl leading-none sm:text-5xl">
                Book, tape, and balances in one frame.
              </h2>
            </div>
            <p className="max-w-xs text-pretty text-sm leading-relaxed text-zinc-400">
              A quiet console built for reading the market before you send size.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <LandingOrderBook />

            <div className="flex flex-col gap-4">
              <div className="border border-zinc-800 bg-zinc-900/60">
                <div className="border-b border-zinc-800 px-4 py-3 font-mono text-xs tracking-[0.16em] text-zinc-400 uppercase">
                  Recent fills
                </div>
                <ul className="divide-y divide-zinc-800 font-mono text-xs tabular-nums">
                  {TAPE_ROWS.slice(0, 6).map((row) => (
                    <li
                      key={`${row.side}-${row.price}-${row.qty}`}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <span
                        className={
                          row.side === "buy"
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }
                      >
                        {row.side.toUpperCase()}
                      </span>
                      <span className="text-zinc-400">{row.qty} SOL</span>
                      <span className="text-zinc-100">{row.price}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border border-zinc-800 bg-zinc-900/60 px-4 py-4">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500 uppercase">
                    USD
                  </p>
                  <p className="mt-2 font-mono text-2xl tabular-nums">
                    12,480.00
                  </p>
                </div>
                <div className="border border-zinc-800 bg-zinc-900/60 px-4 py-4">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500 uppercase">
                    SOL
                  </p>
                  <p className="mt-2 font-mono text-2xl tabular-nums">84.250</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="product"
        className="relative isolate overflow-hidden border-t border-emerald-900/10 bg-[#f7fbf8] dark:border-border dark:bg-background"
      >
        <SectionWash opacity={0.05} />
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:px-8 sm:py-24">
          <p className="font-mono text-xs tracking-[0.18em] text-emerald-800/70 uppercase dark:text-muted-foreground">
            Flow
          </p>
          <h2 className="mt-3 max-w-xl text-balance font-display text-4xl leading-none text-zinc-950 sm:text-5xl dark:text-foreground">
            From sign in to fill in three moves.
          </h2>

          <ol className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-3 sm:gap-5">
            {[
              {
                step: "01",
                title: "Sign in",
                body: "Continue with Google. Paper balances are ready without wallet setup.",
              },
              {
                step: "02",
                title: "Fund the ledger",
                body: "Credit SOL and USD on the engine so every order sits on real available size.",
              },
              {
                step: "03",
                title: "Send the order",
                body: "Hit spot or perps, watch the book update, and keep a durable fill history.",
              },
            ].map((item) => (
              <li
                key={item.step}
                className="border border-emerald-900/10 bg-white p-6 shadow-[0_14px_40px_rgba(15,40,28,0.05)] dark:border-border dark:bg-transparent dark:shadow-none"
              >
                <p className="font-mono text-xs tracking-[0.18em] text-emerald-700 dark:text-muted-foreground">
                  {item.step}
                </p>
                <h3 className="mt-3 text-lg font-semibold text-zinc-950 dark:text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-zinc-600 dark:text-muted-foreground">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>

          <ul className="mt-16 space-y-0 border-t border-emerald-900/10 dark:border-border">
            {[
              {
                title: "Balances you can trust",
                body: "Paper SOL and USD sit on the engine ledger so funding and fills stay consistent.",
              },
              {
                title: "Spot and perps together",
                body: "Limit and market orders on SOL USD spot, or leveraged perpetual exposure when you need it.",
              },
              {
                title: "A tape that lasts",
                body: "Live prices, fills, and durable market data so you can review what actually happened.",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="grid gap-2 border-b border-emerald-900/10 py-8 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-8 dark:border-border"
              >
                <h3 className="text-lg font-semibold text-zinc-950 dark:text-foreground">
                  {item.title}
                </h3>
                <p className="text-pretty text-base leading-relaxed text-zinc-600 dark:text-muted-foreground">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="relative isolate overflow-hidden border-t border-border">
        <Image
          src="/financeBg.jpg"
          alt=""
          fill
          quality={90}
          sizes="100vw"
          className="object-cover object-[center_40%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,9,11,0.82)_0%,rgba(9,9,11,0.68)_45%,rgba(9,9,11,0.88)_100%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(16,185,129,0.18)_0%,transparent_55%)]"
        />

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-8 sm:py-32">
          <p className="font-mono text-xs tracking-[0.22em] text-emerald-300/80 uppercase">
            Start on paper
          </p>
          <h2 className="mt-5 text-balance font-display text-5xl leading-none text-white sm:text-6xl md:text-7xl">
            Open the book.
            <br />
            Send your first fill.
          </h2>
          <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
            Sign in with Google, fund SOL and USD on the ledger, and trade spot
            or perps without wallet setup.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <AuthCta
              session={session}
              onDashboard={openDashboard}
              className="h-12 min-w-[220px] rounded-md bg-white px-6 text-base font-semibold text-zinc-950 hover:bg-white/90 active:scale-[0.98]"
            />
            <a
              href="#app"
              className="inline-flex h-12 items-center justify-center rounded-md border border-white/20 bg-white/5 px-6 text-base font-semibold text-white backdrop-blur-sm transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/10"
            >
              See the app
            </a>
          </div>

          <p className="mt-8 max-w-lg text-pretty text-sm leading-relaxed text-white/45">
            PaperTrade runs on paper balances only. Nothing here is real money, and
            perpetual markets include simulated leverage risk for learning.
          </p>
          <p className="mt-3 font-mono text-xs tracking-[0.14em] text-white/35 uppercase">
            Google sign in · Paper balances · SOL USD
          </p>
        </div>
      </section>

      <footer className="border-t border-emerald-950/20 bg-[#0d1612] text-zinc-50 dark:border-border dark:bg-background dark:text-foreground">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-display text-xl">PaperTrade</p>
            <div className="flex flex-wrap gap-5 text-sm text-zinc-400 dark:text-muted-foreground">
              <a href="#markets" className="hover:text-white dark:hover:text-foreground">
                Markets
              </a>
              <a href="#app" className="hover:text-white dark:hover:text-foreground">
                App
              </a>
              <a href="#desk" className="hover:text-white dark:hover:text-foreground">
                Desk
              </a>
              <a href="#product" className="hover:text-white dark:hover:text-foreground">
                Product
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

function SectionWash({ opacity = 0.08 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 dark:hidden"
      style={{ opacity }}
    >
      <Image
        src="/money.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-[#eef4f0]/70" />
    </div>
  );
}

function ProductShot() {
  return (
    <section
      id="app"
      className="relative isolate overflow-hidden border-t border-emerald-900/10 bg-[#f7fbf8] dark:border-border dark:bg-muted/30"
    >
      <SectionWash opacity={0.06} />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:px-8 sm:py-24">
        <p className="font-mono text-xs tracking-[0.18em] text-emerald-800/70 uppercase dark:text-muted-foreground">
          The app
        </p>
        <h2 className="mt-3 max-w-xl text-balance font-display text-4xl leading-none text-zinc-950 sm:text-5xl dark:text-foreground">
          The desk you open after sign in.
        </h2>
        <p className="mt-4 max-w-lg text-pretty text-base leading-relaxed text-zinc-600 dark:text-muted-foreground">
          Spot, perps, balances, and the live book in one frame after you sign
          in.
        </p>

        <div className="relative mt-10 overflow-hidden border border-emerald-950/15 bg-zinc-950 shadow-[0_28px_80px_rgba(12,30,22,0.22)] dark:border-border dark:shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <span className="size-2.5 rounded-full bg-zinc-700" />
            <span className="size-2.5 rounded-full bg-zinc-700" />
            <span className="size-2.5 rounded-full bg-zinc-700" />
            <span className="ml-3 font-mono text-[11px] tracking-[0.14em] text-zinc-500 uppercase">
              PaperTrade · spot · SOL-USD
            </span>
          </div>

          <div className="bg-zinc-900">
            {/* eslint-disable-next-line @next/next/no-img-element -- serve screenshot bytes as-is; Next/Image was upscaling past source width */}
            <img
              src="/product-shot.png"
              alt="PaperTrade trading desk showing the SOL USD order book and balances"
              width={1183}
              height={585}
              decoding="async"
              className="block h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingOrderBook() {
  const maxTotal = Math.max(
    BOOK_ASKS[0]?.total ?? 0,
    BOOK_BIDS[BOOK_BIDS.length - 1]?.total ?? 0,
    1,
  );
  const bidVol = BOOK_BIDS.reduce((sum, row) => sum + Number(row.size), 0);
  const askVol = BOOK_ASKS.reduce((sum, row) => sum + Number(row.size), 0);
  const totalVol = bidVol + askVol;
  const bidPct = Math.round((bidVol / totalVol) * 100);
  const askPct = 100 - bidPct;

  return (
    <div className="border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <span className="font-mono text-xs tracking-[0.16em] text-zinc-400 uppercase">
          Order book
        </span>
        <span className="font-mono text-xs tabular-nums text-zinc-500">
          SOL-USD
        </span>
      </div>

      <div className="grid grid-cols-3 px-3 py-2 font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div className="font-mono text-xs tabular-nums">
        {BOOK_ASKS.map((row) => (
          <DepthRow
            key={`ask-${row.price}`}
            price={row.price}
            size={row.size}
            total={row.total}
            maxTotal={maxTotal}
            tone="ask"
          />
        ))}

        <div className="flex items-baseline gap-2 bg-zinc-950/70 px-3 py-2.5">
          <span className="text-lg font-semibold leading-none text-emerald-300">
            148.32
          </span>
          <span className="text-[11px] text-zinc-500">148.335</span>
          <span className="ml-auto text-[11px] text-emerald-300/80">+0.41</span>
        </div>

        {BOOK_BIDS.map((row) => (
          <DepthRow
            key={`bid-${row.price}`}
            price={row.price}
            size={row.size}
            total={row.total}
            maxTotal={maxTotal}
            tone="bid"
          />
        ))}
      </div>

      <div className="px-3 pb-3 pt-2">
        <div className="relative flex h-5 overflow-hidden rounded-sm text-[10px] font-medium">
          <div
            className="flex items-center bg-emerald-500/90 pl-2 text-zinc-950"
            style={{ width: `${bidPct}%` }}
          >
            B {bidPct}%
          </div>
          <div
            className="flex items-center justify-end bg-rose-500/90 pr-2 text-zinc-950"
            style={{ width: `${askPct}%` }}
          >
            A {askPct}%
          </div>
        </div>
      </div>
    </div>
  );
}

function DepthRow({
  price,
  size,
  total,
  maxTotal,
  tone,
}: {
  price: string;
  size: string;
  total: number;
  maxTotal: number;
  tone: "bid" | "ask";
}) {
  const width = Math.min(100, (total / maxTotal) * 100);

  return (
    <div className="relative grid grid-cols-3 px-3 py-1.5">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 ${
          tone === "bid" ? "bg-emerald-500/20" : "bg-rose-500/20"
        }`}
        style={{ width: `${width}%` }}
      />
      <span
        className={`relative ${
          tone === "bid" ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {price}
      </span>
      <span className="relative text-right text-zinc-300">{size}</span>
      <span className="relative text-right text-zinc-500">
        {total.toFixed(1)}
      </span>
    </div>
  );
}

function TaglineReveal() {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const [activeCount, setActiveCount] = useState(0);
  const visibleCount = reduceMotion ? TAGLINE_WORDS.length : activeCount;

  useEffect(() => {
    if (reduceMotion) return;

    const node = ref.current;
    if (!node) return;

    let frame = 0;
    let started = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || started) return;
        started = true;
        observer.disconnect();

        let index = 0;
        const tick = () => {
          index += 1;
          setActiveCount(index);
          if (index < TAGLINE_WORDS.length) {
            frame = window.setTimeout(tick, 70);
          }
        };
        frame = window.setTimeout(tick, 120);
      },
      { threshold: 0.45 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(frame);
    };
  }, [reduceMotion]);

  return (
    <section className="relative isolate overflow-hidden border-t border-emerald-900/10 bg-[#eef4f0] dark:border-border dark:bg-background">
      <SectionWash opacity={0.1} />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-20 sm:px-8 sm:py-28">
        <p className="mb-6 font-mono text-xs tracking-[0.18em] text-emerald-800/70 uppercase dark:text-muted-foreground">
          Why PaperTrade
        </p>
        <p
          ref={ref}
          className="max-w-[680px] text-balance font-display text-4xl leading-tight text-zinc-950 sm:text-5xl md:text-6xl dark:text-foreground"
        >
          {TAGLINE_WORDS.map((word, index) => (
            <span
              key={`${word}-${index}`}
              className="mr-[0.28em] inline-block transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] last:mr-0"
              style={{
                color:
                  index < visibleCount
                    ? undefined
                    : "color-mix(in oklab, currentColor 28%, transparent)",
              }}
            >
              {word}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
