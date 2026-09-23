"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "idea", label: "The idea" },
  { id: "pieces", label: "Main pieces" },
  { id: "path", label: "Order path" },
  { id: "credit", label: "Paper credit" },
  { id: "data", label: "Live vs history" },
  { id: "persist", label: "Durability" },
  { id: "perps", label: "Perp risk" },
] as const;

export function HowItWorks() {
  return (
    <div className="animate-fade-up mx-auto w-full max-w-5xl py-4 sm:py-6">
      <header className="mb-8 max-w-2xl border-b border-zinc-200 pb-6 sm:mb-10 sm:pb-8 dark:border-zinc-800">
        <p className="font-mono text-[10px] tracking-[0.18em] text-emerald-700 uppercase dark:text-emerald-400">
          System
        </p>
        <h1 className="mt-1 font-display text-3xl tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">
          How it works
        </h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
          Architecture of the paper exchange: which services own what, how an
          order moves, and how reconnects and crashes stay visible.
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
          <DocSection id="idea" title="The idea">
            <p>
              PaperTrade is a systems project: a single-writer matching engine, an
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
            <dl className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <SysPart
                name="Exchange"
                body={
                  <>
                    Matching engine for <Code>SOL-USD</Code> and{" "}
                    <Code>SOL-USD-PERP</Code>. Owns balances, positions, fills,
                    WAL, and snapshots. Authoritative for locks and risk.
                  </>
                }
              />
              <SysPart
                name="OMS"
                body="Product-facing order state in Postgres, command outbox, and event-driven status updates. A durable projection, not a second matcher."
              />
              <SysPart
                name="Engine gateway"
                body="Sole client of the exchange: Redis commands → engine HTTP; SSE → order and market-data fan-out with dedupe."
              />
              <SysPart
                name="Ingester"
                body={
                  <>
                    Consumes durable <Code>md:events</Code> into TimescaleDB
                    (trades, BBO, candles) for history and charts.
                  </>
                }
              />
              <SysPart
                name="Web"
                body="Trading interface with Google sign-in, paper credit, Spot/Perps desks, and live connections to the market services."
              />
              <SysPart
                name="Redis"
                body="Command streams, pub/sub for live ticks, and durable market-data event streams between services."
              />
            </dl>
          </DocSection>

          <DocSection id="path" title="Order path">
            <p>
              Place and cancel do not “write the DB and hope.” They flow through
              Redis Streams and a Postgres outbox so the product can recover.
            </p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                Web BFF authenticates the session and posts place/cancel to the
                OMS.
              </li>
              <li>
                OMS writes order intent + outbox row in one transaction, then
                publishes a command onto Redis Streams.
              </li>
              <li>
                Engine gateway consumes the stream, calls the exchange HTTP API,
                and fans events back out.
              </li>
              <li>
                Exchange matches, locks balances or margin, emits fills and
                status with an engine sequence.
              </li>
              <li>
                OMS applies events to product order state. Maker and taker fills
                share a trade id but are stored per order.
              </li>
            </ol>
            <p>
              The engine stays authoritative for what actually matched. The OMS
              records what the UI needs to show and replay after a crash.
            </p>
          </DocSection>

          <DocSection id="credit" title="Paper credit">
            <p>
              Home “Add USD / Add SOL” hits a BFF credit endpoint. That is still
              a command into the engine ledger — not a cosmetic UI counter.
            </p>
            <p>
              Available vs locked comes from engine balances. Open spot orders
              and perp margin reserve size until fill, cancel, or liquidation.
            </p>
          </DocSection>

          <DocSection id="data" title="Live vs history">
            <p>
              Live market data is ephemeral (pub/sub): best bid/ask and trade
              ticks for the desks. History is durable:{" "}
              <Code>md:events</Code> → ingester → Timescale for charts and
              replayable tapes.
            </p>
            <p>
              SSE reconnect uses <Code>streamSeq</Code> catch-up. If the
              in-memory ring was overrun, a gap signal triggers reconcile so the
              OMS can catch up from retained engine state.
            </p>
            <dl className="mt-2 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <SysPart
                name="Live"
                body="Book, last trade, position updates — for the trading desk now."
              />
              <SysPart
                name="History"
                body="Candles and durable trades — for charts and audits after the fact."
              />
            </dl>
          </DocSection>

          <DocSection id="persist" title="Durability">
            <ul className="list-disc space-y-3 pl-5">
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Engine WAL + snapshots
                </strong>{" "}
                — recover matching state after process restart.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  OMS outbox
                </strong>{" "}
                — commands survive OMS restarts before Redis ack is certain.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Engine sequence
                </strong>{" "}
                — events are ordered so consumers can detect gaps and reconcile.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Timescale
                </strong>{" "}
                — market history independent of the live pub/sub fan-out.
              </li>
            </ul>
          </DocSection>

          <DocSection id="perps" title="Perp risk">
            <p>
              Perps add USD margin, positions, mark price, liquidation, and
              funding on the same engine as spot. Risk checks run with matching
              — not as a separate after-the-fact service.
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                Mark price drives unrealized PnL and liquidation distance.
              </li>
              <li>
                Maintenance margin is checked continuously; breach can liquidate
                the position.
              </li>
              <li>
                Funding settles periodically between longs and shorts to keep
                perp price near spot.
              </li>
            </ul>
          </DocSection>

          <footer className="border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <p className="font-mono text-[10px] tracking-[0.16em] text-zinc-400 uppercase">
              Related
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/dashboard/apps"
                className={cn(
                  buttonVariants(),
                  "h-9 rounded-md px-4 text-sm font-semibold",
                )}
              >
                Guide
              </Link>
              <Link
                href="/spot"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-9 rounded-md px-4 text-sm font-semibold",
                )}
              >
                Spot desk
              </Link>
              <Link
                href="/perps"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-9 rounded-md px-4 text-sm font-semibold",
                )}
              >
                Perps desk
              </Link>
            </div>
          </footer>
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

function SysPart({
  name,
  body,
}: {
  name: string;
  body: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-zinc-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800 sm:flex-row sm:gap-6">
      <dt className="shrink-0 font-medium text-zinc-950 sm:w-36 dark:text-zinc-50">
        {name}
      </dt>
      <dd>{body}</dd>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-xs text-zinc-800 dark:text-zinc-200">{children}</code>;
}
