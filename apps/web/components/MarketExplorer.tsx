"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "what", label: "What is this?" },
  { id: "start", label: "Your first trade" },
  { id: "desk", label: "Reading the desk" },
  { id: "spot", label: "Spot trading" },
  { id: "perps", label: "Perps trading" },
  { id: "orders", label: "Orders and status" },
  { id: "words", label: "Words you will see" },
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
          A first-visit walkthrough. You will add practice money, place one
          order, and learn what the screens are showing. Balances are credits
          you add yourself. Nothing here is real money.
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
              PaperDesk is a practice exchange. The buttons work like a trading
              desk. The money is credit you add on{" "}
              <Link
                href="/dashboard"
                className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
              >
                Home
              </Link>
              . A balance of zero just means you have not added any yet.
            </p>
            <p>
              There is one price, SOL in USD, and two ways to trade it.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Spot
                </strong>{" "}
                is buying and selling the coin. Buy spends USD and gives you
                SOL. Sell spends SOL and gives you USD.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Perps
                </strong>{" "}
                is a bet on that price. Long profits if SOL rises. Short
                profits if it falls. You put up USD as a deposit. You do not
                receive the coin.
              </li>
            </ul>
            <p>
              Start on Spot. Perps uses leverage, so a small price move can use
              up the deposit.
            </p>
          </WikiSection>

          <WikiSection id="start" title="Your first trade">
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Open{" "}
                <Link
                  href="/dashboard"
                  className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  Home
                </Link>
                . The right side is your paper wallet.
              </li>
              <li>
                Next to USD, click{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Add
                </strong>
                . Type a whole number, such as 10000, then{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Confirm
                </strong>
                . That USD is available on both Spot and Perps.
              </li>
              <li>
                The big number is{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  available
                </strong>
                : free to use.{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Locked
                </strong>{" "}
                is set aside for an open order, or for a perp deposit. Right
                after you add credit, locked is zero.
              </li>
              <li>
                Open{" "}
                <Link
                  href="/spot"
                  className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  Spot
                </Link>
                . Leave{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Buy
                </strong>{" "}
                selected. Click{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Mid
                </strong>{" "}
                to copy a price near the middle of the book, or click a price
                in the book itself. Quantity is how many SOL you want.
              </li>
              <li>
                Press{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Buy SOL
                </strong>
                . If someone is already selling at your price or lower, the
                order fills and your SOL balance goes up. If every seller is
                higher, the order waits, and the USD it needs stays locked
                until it fills or you press Cancel.
              </li>
              <li>
                The list under the chart is that order.{" "}
                <Link
                  href="/dashboard/orders"
                  className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
                >
                  Orders
                </Link>{" "}
                is the same list with the full history.
              </li>
            </ol>
            <p>
              To practice a sell, Add some SOL on Home the same way. SOL is
              only spent on Spot. Perps uses USD.
            </p>
          </WikiSection>

          <WikiSection id="desk" title="Reading the desk">
            <p>
              Spot and Perps use the same layout. Once you can name the four
              areas, both pages read the same way.
            </p>
            <dl className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <DeskPart
                name="Chart"
                body="Recent prices, drawn as candles. Each candle is a slice of time."
              />
              <DeskPart
                name="Order book"
                body="Waiting buy orders (bids) and sell orders (asks). The closest prices meet in the middle. Click a price to copy it into the form."
              />
              <DeskPart
                name="Ticket"
                body="The order form. Spot says Buy or Sell. Perps says Long or Short. You set a price and a size, then submit."
              />
              <DeskPart
                name="Bottom strip"
                body="Spot lists open and recent orders. Perps adds a Position tab next to Orders."
              />
            </dl>
            <p className="mt-4">
              The top of the page shows the latest price and whether the live
              feed is connected. When the feed returns, the book fills back in.
            </p>
          </WikiSection>

          <WikiSection id="spot" title="Spot trading">
            <p>
              Spot swaps your practice USD and SOL. A buy can only spend the
              USD you already have available.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Buy
                </strong>{" "}
                spends USD and adds SOL.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Sell
                </strong>{" "}
                spends SOL and adds USD. Add SOL on Home first if your SOL
                balance is zero.
              </li>
              <li>
                The form is a{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  limit order
                </strong>
                . It trades at your price or a better one. A buy at 140 fills
                when a seller is at 140 or lower. If every seller is higher,
                your buy waits on the book.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Mid
                </strong>{" "}
                copies the halfway point between the best buy and the best
                sell.{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  BBO
                </strong>{" "}
                copies the best price on your side.
              </li>
            </ul>
            <p>
              Leave IOC and FOK unchecked for a first trade. The order then
              stays open until it fills or you cancel it.{" "}
              <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                IOC
              </strong>{" "}
              fills whatever it can right now and cancels the rest.{" "}
              <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                FOK
              </strong>{" "}
              fills the whole quantity now, or cancels the whole order.
            </p>
            <p>
              An open order locks the USD or SOL it needs. Cancel sits on the
              order row while the status is still open.
            </p>
          </WikiSection>

          <WikiSection id="perps" title="Perps trading">
            <p>
              A perp is a price bet paid in USD. Long profits when SOL rises.
              Short profits when it falls. Your SOL balance does not change.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>
                You need available USD. That USD is the{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  margin
                </strong>
                , a deposit held while the position is open.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Leverage
                </strong>{" "}
                is the slider from 1x to 20x. At 5x, a position worth about 500
                USD locks about 100 USD. The same price move is a larger gain
                or loss, and you are closer to liquidation.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Est. margin
                </strong>{" "}
                on the form is the USD that locks if the order fills. The
                button reads Long or Short plus the leverage, such as Long 5x.
              </li>
              <li>
                The{" "}
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Position
                </strong>{" "}
                tab shows side, size, entry price, margin, unrealized profit or
                loss, and the liquidation price. Unrealized is the result if
                you closed at the current mark. It is not in your available
                balance yet.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Mark price
                </strong>{" "}
                is the price used for that profit and for liquidation. It is
                the middle of the book, or the last trade when the book has no
                middle.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Funding
                </strong>{" "}
                is a small USD payment between longs and shorts. On this demo
                it runs about once a minute. When the rate is positive, longs
                pay shorts.
              </li>
            </ul>
            <p>
              To shrink a long, submit a Short. To shrink a short, submit a
              Long. If losses use up the margin cushion, the position is closed
              for you. That close is a liquidation.
            </p>
          </WikiSection>

          <WikiSection id="orders" title="Orders and status">
            <p>
              Home shows a short recent list.{" "}
              <Link
                href="/dashboard/orders"
                className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
              >
                Orders
              </Link>{" "}
              is the full history. Click a row for the average fill price and
              each fill. Filters cover market, side, type, and time.
            </p>
            <dl className="mt-4 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <DeskPart
                name="Pending, Accepted, Open"
                body="The order is on its way, or waiting on the book. You can usually cancel it."
              />
              <DeskPart
                name="Partial"
                body="Some of the size traded. The rest is still open."
              />
              <DeskPart
                name="Filled"
                body="The whole size traded. Nothing left to cancel."
              />
              <DeskPart
                name="Cancelled"
                body="You stopped it, or an IOC or FOK rule cancelled what could not trade immediately."
              />
              <DeskPart
                name="Rejected or Failed"
                body="It never traded. The row can include a reason. A common one is not enough available balance."
              />
            </dl>
          </WikiSection>

          <WikiSection id="words" title="Words you will see">
            <dl className="space-y-4">
              <GlossaryTerm term="Order book">
                The live list of buy and sell orders waiting to trade.
              </GlossaryTerm>
              <GlossaryTerm term="Bid and ask">
                A bid is a waiting buy. An ask is a waiting sell.
              </GlossaryTerm>
              <GlossaryTerm term="Fill">
                One matched piece of your order, at a price and a size. A
                large order can fill in several pieces.
              </GlossaryTerm>
              <GlossaryTerm term="Available and locked">
                Available is free to spend. Locked is reserved for an open
                order or for perp margin.
              </GlossaryTerm>
              <GlossaryTerm term="Limit order">
                An order that trades only at your price or a better one, and
                waits on the book until then.
              </GlossaryTerm>
              <GlossaryTerm term="Mid and BBO">
                Mid is halfway between the best bid and the best ask. BBO is
                the best price on your side of the book.
              </GlossaryTerm>
              <GlossaryTerm term="IOC and FOK">
                IOC fills what it can immediately and cancels the rest. FOK
                fills the entire size now, or cancels the order.
              </GlossaryTerm>
              <GlossaryTerm term="Margin">
                The USD deposit a perp holds while the position is open.
              </GlossaryTerm>
              <GlossaryTerm term="Leverage">
                How large the position is compared with the margin. 5x means
                the position is about five times the USD you lock.
              </GlossaryTerm>
              <GlossaryTerm term="Notional">
                Price times size: the USD value of the order before leverage.
              </GlossaryTerm>
              <GlossaryTerm term="Mark price">
                The perp price used for profit and for liquidation checks.
              </GlossaryTerm>
              <GlossaryTerm term="Liquidation">
                An automatic close when losses have used up the margin cushion.
              </GlossaryTerm>
              <GlossaryTerm term="Funding">
                A small scheduled payment between longs and shorts.
              </GlossaryTerm>
            </dl>
            <p className="mt-6 text-zinc-500 dark:text-zinc-400">
              For the path behind a click — the matching engine, the order
              handoff, and how charts are stored — see{" "}
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
