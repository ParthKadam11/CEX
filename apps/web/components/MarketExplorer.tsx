"use client";

import Link from "next/link";

const SECTIONS = [
  { id: "what", label: "What is this?" },
  { id: "start", label: "How to start" },
  { id: "spot", label: "Spot trading" },
  { id: "perps", label: "Perps trading" },
  { id: "words", label: "Simple glossary" },
] as const;

export function MarketExplorer() {
  return (
    <div className="animate-fade-up mx-auto w-full max-w-5xl py-6 sm:py-10">
      <header className="mb-8 max-w-2xl border-b border-zinc-200 pb-6 sm:mb-10 sm:pb-8 dark:border-zinc-800">
        <p className="text-sm text-zinc-400">Guide</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">
          Getting around
        </h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
          New here? This page explains the project in plain language — what you
          can do, and what the buttons mean. No engineering background needed.
        </p>
      </header>

      <nav
        aria-label="On this page"
        className="-mx-1 mb-8 flex gap-1 overflow-x-auto px-1 pb-1 lg:hidden"
      >
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16">
        <nav
          aria-label="On this page"
          className="hidden lg:sticky lg:top-6 lg:block lg:self-start"
        >
          <p className="mb-3 text-xs font-medium tracking-wide text-zinc-400 uppercase">
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
                practice exchange
              </strong>
              . You can buy and sell as if it were a real crypto exchange, but
              the money is fake — paper balances you add yourself.
            </p>
            <p>
              Think of it like a flight simulator for trading: the screens and
              buttons feel real, so you can learn how markets work without risking
              cash.
            </p>
            <p>
              There are two places to trade:{" "}
              <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                Spot
              </strong>{" "}
              (simple buy/sell) and{" "}
              <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                Perps
              </strong>{" "}
              (borrowed-size bets that can go up or down). Both use SOL priced in
              USD.
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
                . That is your account overview — who you are, open orders, and
                balances.
              </li>
              <li>
                Add paper money with{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Add USD
                </strong>{" "}
                or{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Add SOL
                </strong>
                . Pick an amount and confirm. Nothing leaves a real bank.
              </li>
              <li>
                Go to{" "}
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
                , choose buy or sell (or long/short), enter a size, and place the
                order.
              </li>
              <li>
                Watch the chart, the order book (other people’s resting prices),
                and your orders list update as trades happen.
              </li>
            </ol>
            <p className="mt-4">
              Prefer the full order history? Use the{" "}
              <Link
                href="/dashboard/orders"
                className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
              >
                Orders
              </Link>{" "}
              tab in the sidebar.
            </p>
          </WikiSection>

          <WikiSection id="spot" title="Spot trading">
            <p>
              Spot is the straightforward market: you trade SOL for USD (or the
              other way around) at the price people are offering.
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
                  Limit order
                </strong>{" "}
                — “only trade at this price (or better).” It can wait on the book.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Market order
                </strong>{" "}
                — “trade now at whatever the market will give me.”
              </li>
            </ul>
            <p className="mt-4">
              You can only spend what you have available. If some money is tied
              up in an open order, it shows as locked on Home until that order
              finishes or you cancel it.
            </p>
          </WikiSection>

          <WikiSection id="perps" title="Perps trading">
            <p>
              Perpetuals (“perps”) let you bet that SOL’s price will rise or fall
              without owning the coin the whole time. You put up USD as a
              safety deposit (margin) and can control a larger size with leverage.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Long
                </strong>{" "}
                — you profit if the price goes up.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Short
                </strong>{" "}
                — you profit if the price goes down.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Leverage
                </strong>{" "}
                — multiplies both gains and losses. Higher leverage means less
                room for the price to move against you.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Liquidation
                </strong>{" "}
                — if losses eat too much of your margin, the system closes the
                position for you so you cannot go endlessly negative.
              </li>
            </ul>
            <p className="mt-4">
              On the Perps page, the bottom tabs show your{" "}
              <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                Position
              </strong>{" "}
              (what you are currently holding) and your{" "}
              <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                Orders
              </strong>
              .
            </p>
          </WikiSection>

          <WikiSection id="words" title="Simple glossary">
            <dl className="space-y-4">
              <GlossaryTerm term="Order book">
                A live list of buy and sell prices waiting to be matched. Bids
                are buyers; asks are sellers.
              </GlossaryTerm>
              <GlossaryTerm term="Fill">
                When your order actually trades — part or all of it gets matched.
              </GlossaryTerm>
              <GlossaryTerm term="Available / locked">
                Available is free to use. Locked is reserved for an open order or
                perp margin.
              </GlossaryTerm>
              <GlossaryTerm term="Mark price">
                On perps, the fair price used to measure profit and whether you
                are close to liquidation.
              </GlossaryTerm>
              <GlossaryTerm term="Funding">
                A small periodic payment between longs and shorts that helps keep
                the perp price near the spot market.
              </GlossaryTerm>
            </dl>
            <p className="mt-6 text-zinc-500 dark:text-zinc-400">
              Curious how the software is built behind the scenes? See{" "}
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
            <p className="text-zinc-500 dark:text-zinc-400">
              Jump in:{" "}
              <Link
                href="/dashboard"
                className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
              >
                Home
              </Link>
              {" · "}
              <Link
                href="/spot"
                className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
              >
                Spot
              </Link>
              {" · "}
              <Link
                href="/perps"
                className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
              >
                Perps
              </Link>
            </p>
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
