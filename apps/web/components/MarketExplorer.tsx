"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "what", label: "What is this?" },
  { id: "start", label: "How to start" },
  { id: "desk", label: "Reading the desk" },
  { id: "spot", label: "Spot trading" },
  { id: "perps", label: "Perps trading" },
  { id: "orders", label: "Orders and status" },
  { id: "words", label: "Simple glossary" },
] as const;

export function MarketExplorer() {
  return (
    <div className="animate-fade-up mx-auto w-full max-w-5xl py-4 sm:py-6">
      <header className="mb-8 max-w-2xl border-b border-zinc-200 pb-6 sm:mb-10 sm:pb-8 dark:border-zinc-800">
        <p className="font-mono text-[10px] tracking-[0.18em] text-emerald-700 uppercase dark:text-emerald-400">
          Guide
        </p>
        <h1 className="mt-1 font-display text-3xl tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">
          Getting around
        </h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
          Plain language walkthrough of paper Spot and Perps: how to fund,
          place, cancel, and read what the screens mean.
        </p>
      </header>

      <nav
        aria-label="On this page"
        className="mb-10 border-b border-zinc-200 pb-6 lg:hidden dark:border-zinc-800"
      >
        <p className="mb-3 font-mono text-[10px] font-medium tracking-[0.14em] text-zinc-400 uppercase">
          On this page
        </p>
        <ol className="space-y-2.5">
          {SECTIONS.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="flex items-baseline gap-3 text-sm text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                <span className="w-4 shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                  {index + 1}
                </span>
                <span>{section.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16">
        <nav
          aria-label="On this page"
          className="hidden lg:sticky lg:top-6 lg:block lg:self-start"
        >
          <p className="mb-3 font-mono text-[10px] font-medium tracking-[0.14em] text-zinc-400 uppercase">
            On this page
          </p>
          <ul className="space-y-2 text-sm">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-zinc-500 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="max-w-2xl space-y-14 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          <WikiSection id="what" title="What is this?">
            <p>
              CEX is a{" "}
              <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                paper practice exchange
              </strong>
              . Screens and buttons feel like a real desk, but balances are fake
              credits you add yourself. No real funds settle here.
            </p>
            <p>
              Two markets, one pair:{" "}
              <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                Spot
              </strong>{" "}
              (SOL-USD buy/sell) and{" "}
              <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                Perps
              </strong>{" "}
              (SOL-USD-PERP long/short with leverage).
            </p>
          </WikiSection>

          <WikiSection id="start" title="How to start">
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Open{" "}
                <Link
                  href="/dashboard"
                  className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  Home
                </Link>
                . That is your paper ledger: balances, open orders, and recent
                activity.
              </li>
              <li>
                Under Balances, click{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Add
                </strong>{" "}
                on USD or SOL, type a whole number, and confirm. That credits the
                engine ledger.
              </li>
              <li>
                Check{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  available
                </strong>{" "}
                vs{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  locked
                </strong>
                . Available is free to spend. Locked is reserved for open orders
                or perp margin.
              </li>
              <li>
                Open{" "}
                <Link
                  href="/spot"
                  className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  Spot
                </Link>{" "}
                or{" "}
                <Link
                  href="/perps"
                  className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  Perps
                </Link>
                , set side/size (and price for limits), then submit.
              </li>
              <li>
                Watch fills on the desk orders list, or open{" "}
                <Link
                  href="/dashboard/orders"
                  className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  Orders
                </Link>{" "}
                for full history and detail.
              </li>
            </ol>
          </WikiSection>

          <WikiSection id="desk" title="Reading the desk">
            <p>
              Spot and Perps share the same layout. Learn it once and both pages
              make sense.
            </p>
            <dl className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <DeskPart name="Chart" body="Price history for the market." />
              <DeskPart
                name="Order book"
                body="Resting bids (buy) and asks (sell). Click a price to fill the ticket."
              />
              <DeskPart
                name="Ticket"
                body="Where you choose side, limit or market, size, and submit."
              />
              <DeskPart
                name="Bottom strip"
                body="Spot shows open/recent orders. Perps adds Position and Orders tabs."
              />
            </dl>
            <p className="mt-4">
              The top ticker shows last price and connection. If the stream
              drops, reconnect and the book refreshes.
            </p>
          </WikiSection>

          <WikiSection id="spot" title="Spot trading">
            <p>
              Spot trades SOL for USD against your ledger balances. No leverage.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Buy
                </strong>{" "}
                — spend USD, receive SOL.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Sell
                </strong>{" "}
                — spend SOL, receive USD.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Limit
                </strong>{" "}
                — rests on the book at your price (or better). Optional IOC/FOK.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Market
                </strong>{" "}
                — fills now against the book. Buys can use a quote budget.
              </li>
            </ul>
            <p className="mt-4">
              Open orders lock size until filled or cancelled. Cancel from the
              bottom orders list while status is still open.
            </p>
          </WikiSection>

          <WikiSection id="perps" title="Perps trading">
            <p>
              Perps let you go long or short SOL with USD margin and leverage.
              You do not hold the coin outright.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Long / Short
                </strong>{" "}
                — profit if price rises or falls.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Leverage
                </strong>{" "}
                — slider on the ticket (about 1x to 20x). Higher leverage means
                less room before liquidation.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Position tab
                </strong>{" "}
                — side, size, entry, margin, unrealized PnL, equity vs
                maintenance, and liquidation price.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Mark price
                </strong>{" "}
                — fair price used for PnL and liquidation, not always last trade.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Funding
                </strong>{" "}
                — small periodic payment between longs and shorts.
              </li>
            </ul>
            <p className="mt-4">
              To reduce or flip exposure, send the opposite side. If equity falls
              below maintenance, the engine can liquidate the position.
            </p>
          </WikiSection>

          <WikiSection id="orders" title="Orders and status">
            <p>
              Home shows a short open/recent list.{" "}
              <Link
                href="/dashboard/orders"
                className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
              >
                Orders
              </Link>{" "}
              is the full history with filters and a detail panel.
            </p>
            <dl className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <DeskPart
                name="Pending / Accepted / Open"
                body="Working toward or resting on the book. You can usually cancel."
              />
              <DeskPart
                name="Partial"
                body="Some size filled; remainder still open."
              />
              <DeskPart name="Filled" body="Fully matched. Done." />
              <DeskPart
                name="Cancelled / Rejected / Failed"
                body="No longer working. Rejected or failed may show a reason in detail."
              />
            </dl>
            <p className="mt-4">
              Click a row on Orders to see average fill, fill tape, and cancel
              when still open. Filters cover market, side, type, and time.
            </p>
          </WikiSection>

          <WikiSection id="words" title="Simple glossary">
            <dl className="space-y-4">
              <GlossaryTerm term="Order book">
                Live bids and asks waiting to match.
              </GlossaryTerm>
              <GlossaryTerm term="Fill">
                A matched piece of your order at a price and size.
              </GlossaryTerm>
              <GlossaryTerm term="Available / locked">
                Free balance vs size reserved for open orders or margin.
              </GlossaryTerm>
              <GlossaryTerm term="BBO / Mid">
                Best bid/offer on the book, and the midpoint between them.
              </GlossaryTerm>
              <GlossaryTerm term="Mark price">
                Perp fair price for PnL and liquidation checks.
              </GlossaryTerm>
              <GlossaryTerm term="Funding">
                Periodic payment between longs and shorts.
              </GlossaryTerm>
            </dl>
            <p className="mt-6 text-zinc-500 dark:text-zinc-400">
              Want the engineering path behind a click? See{" "}
              <Link
                href="/dashboard/how-it-works"
                className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
              >
                System
              </Link>
              .
            </p>
          </WikiSection>

          <footer className="border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <p className="font-mono text-[10px] tracking-[0.16em] text-zinc-400 uppercase">
              Jump in
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-9 rounded-md px-4 text-sm font-semibold",
                )}
              >
                Home
              </Link>
              <Link
                href="/spot"
                className={cn(
                  buttonVariants(),
                  "h-9 rounded-md px-4 text-sm font-semibold",
                )}
              >
                Spot
              </Link>
              <Link
                href="/perps"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-9 rounded-md px-4 text-sm font-semibold",
                )}
              >
                Perps
              </Link>
              <Link
                href="/dashboard/orders"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-9 rounded-md px-4 text-sm font-semibold",
                )}
              >
                Orders
              </Link>
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}

function WikiSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="font-display text-2xl tracking-tight text-zinc-950 dark:text-zinc-50">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function DeskPart({ name, body }: { name: string; body: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-zinc-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800 sm:flex-row sm:gap-6">
      <dt className="shrink-0 font-medium text-zinc-950 sm:w-36 dark:text-zinc-50">
        {name}
      </dt>
      <dd>{body}</dd>
    </div>
  );
}

function GlossaryTerm({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-medium text-zinc-950 dark:text-zinc-50">{term}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
