"use client";

import Link from "next/link";

const SECTIONS = [
  { id: "idea", label: "The idea" },
  { id: "pieces", label: "Main pieces" },
  { id: "path", label: "Order path" },
  { id: "data", label: "Live vs history" },
  { id: "perps", label: "Perp risk" },
] as const;

export function HowItWorks() {
  return (
    <div className="animate-fade-up mx-auto w-full max-w-5xl py-6 sm:py-10">
      <header className="mb-8 max-w-2xl border-b border-zinc-200 pb-6 sm:mb-10 sm:pb-8 dark:border-zinc-800">
        <p className="text-sm text-zinc-400">Architecture</p>
        <h1 className="mt-2 font-display text-3xl tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">
          How it works
        </h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
          The technical side of this paper exchange: which services own what,
          and why the design makes matching, reconnects, and crashes visible.
        </p>
        <p className="mt-3 text-sm text-zinc-400">
          Looking for a non-technical walkthrough? See the{" "}
          <Link
            href="/dashboard/apps"
            className="font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-200"
          >
            Guide
          </Link>
          .
        </p>
      </header>

      <nav
        aria-label="On this page"
        className="mb-10 border-b border-zinc-200 pb-6 lg:hidden dark:border-zinc-800"
      >
        <p className="mb-3 text-[10px] font-medium tracking-[0.14em] text-zinc-400 uppercase">
          On this page
        </p>
        <ol className="space-y-2.5">
          {SECTIONS.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="flex items-baseline gap-3 text-sm text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                <span className="w-4 shrink-0 tabular-nums text-xs text-zinc-400">
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
          <DocSection id="idea" title="The idea">
            <p>
              CEX is a systems project: a single-writer matching engine, an
              asynchronous OMS with a transactional outbox, a gateway that
              translates Redis Streams and exchange SSE, and a separate
              TimescaleDB ingester.
            </p>
            <p>
              Spot and perpetual markets run in-process with mark price,
              liquidation, and funding. The goal is to study what happens after
              someone clicks Buy — not to hide that path behind one CRUD API.
            </p>
          </DocSection>

          <DocSection id="pieces" title="Main pieces">
            <ul className="list-disc space-y-3 pl-5">
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Exchange
                </strong>{" "}
                — matching engine for <code className="text-xs">SOL-USD</code>{" "}
                and <code className="text-xs">SOL-USD-PERP</code>. Owns balances,
                positions, fills, WAL, and snapshots.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  OMS
                </strong>{" "}
                — product-facing order state in Postgres, command outbox, and
                event-driven status updates. A durable projection, not a second
                matcher.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Engine gateway
                </strong>{" "}
                — sole client of the exchange: Redis commands → engine HTTP; SSE
                → order and market-data fan-out.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Ingester
                </strong>{" "}
                — consumes durable market-data events into TimescaleDB
                (trades, BBO, candles).
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Web
                </strong>{" "}
                — Next.js UI with auth, paper credit, Spot/Perps desks, and BFF
                proxies.
              </li>
            </ul>
          </DocSection>

          <DocSection id="path" title="Order path">
            <p>
              Place and cancel flow through Redis Streams and a Postgres outbox
              instead of a synchronous “write DB and hope.” The engine remains
              authoritative for locks and fills; the OMS records what the product
              needs to show and recover.
            </p>
            <p>
              Maker and taker fills share a trade id but are stored per order.
              Events carry an engine sequence so consumers can reason about
              ordering.
            </p>
          </DocSection>

          <DocSection id="data" title="Live vs history">
            <p>
              Live market data is ephemeral (pub/sub): best bid/ask and trade
              ticks for the desks. History is durable:{" "}
              <code className="text-xs">md:events</code> → ingester → Timescale
              for charts and replayable tapes.
            </p>
            <p>
              SSE reconnect uses <code className="text-xs">streamSeq</code>{" "}
              catch-up. If the in-memory ring was overrun, a gap signal triggers
              reconcile so the OMS can catch up from retained engine state.
            </p>
          </DocSection>

          <DocSection id="perps" title="Perp risk">
            <p>
              Perps add USD margin, positions, mark price, liquidation, and
              funding on top of the same engine model as spot. Risk checks run
              with matching — not as a separate after-the-fact service.
            </p>
          </DocSection>
        </article>
      </div>
    </div>
  );
}

function DocSection({
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
