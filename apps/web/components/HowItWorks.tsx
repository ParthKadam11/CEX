import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DiagramFocus } from "@/components/DiagramFocus";

const SECTIONS = [
  { id: "idea", label: "The idea" },
  { id: "desks", label: "The desks" },
  { id: "pieces", label: "Main pieces" },
  { id: "path", label: "Order path" },
  { id: "matching", label: "Matching" },
  { id: "data", label: "Live vs history" },
  { id: "persist", label: "Durability" },
  { id: "perps", label: "Perp risk" },
  { id: "observe", label: "Observability" },
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
          PaperDesk is a paper spot and perpetual exchange. Balances are
          simulated. The path after Buy is the real subject: one matching
          process, an outbox, a gateway, and a separate history writer.
        </p>
        <p className="mt-3 text-sm text-zinc-400">
          For a non-technical walkthrough, see the{" "}
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

        <article className="space-y-14 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          <DocSection id="idea" title="The idea">
            <p>
              Spot and perps run in one exchange process, with mark price,
              liquidation, and funding beside the book. The web app never
              writes a fill itself. It asks the OMS, and the OMS asks the
              engine through Redis.
            </p>
            <p>
              Three stores stay separate on purpose. Postgres holds users and
              product orders. Redis moves commands, engine events, and the
              durable market-data stream. Timescale holds the tape you chart.
              Shared types live in the monorepo: engine commands and events in{" "}
              <Code>exchange-types</Code>, Redis stream names in{" "}
              <Code>app-contracts</Code>, and the Postgres schema in Prisma.
            </p>
          </DocSection>

          <DocSection id="desks" title="The desks">
            <p>
              Sign-in is Google. The first session creates the user row in
              Postgres. From there the product is two markets,{" "}
              <Code>SOL-USD</Code> and <Code>SOL-USD-PERP</Code>, plus a paper
              ledger.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Home credit adds USD or SOL by posting a command. The balance
                you see afterward is the engine&apos;s available and locked
                amounts.
              </li>
              <li>
                The spot desk shows the book, your orders, and a chart. Place
                and cancel go to the OMS. The book, balances, and last trade
                are read from the gateway.
              </li>
              <li>
                The perps desk adds leverage, position, mark, liquidation
                distance, and funding on the same wallet. A perp fill changes
                the position and USD PnL. It does not deliver SOL.
              </li>
              <li>
                Charts and the tape come from the ingester, which serves
                trades, best bid/offer history, and one-minute candles.
              </li>
            </ul>
          </DocSection>

          <DocSection id="pieces" title="Main pieces">
            <p>
              Five processes. The gateway is the sole client of the exchange.
              Everyone else talks to Redis, Postgres, or Timescale.
            </p>
            <dl className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <SysPart
                name="Web"
                body="Next.js trading UI and BFF. Google sign-in creates the user in Postgres. Place, cancel, and credit go to the OMS. Balances, book, mark, positions, and funding are read from the gateway. Charts come from the ingester."
              />
              <SysPart
                name="OMS"
                body="Product order state in Postgres, plus a command outbox in the same transaction. It publishes orders:commands and applies orders:events. It does not match, and it does not talk to the exchange event bus."
              />
              <SysPart
                name="Engine gateway"
                body="The only HTTP and SSE client of the exchange. It consumes commands, calls the engine, and fans events back to Redis. Live BBO and trades go out on pub/sub. A stream gap is closed with GET /v1/markets/:market/reconcile."
              />
              <SysPart
                name="Exchange"
                body={
                  <>
                    Single-writer matcher for <Code>SOL-USD</Code> and{" "}
                    <Code>SOL-USD-PERP</Code>. One process-wide command queue
                    sits inside the shared wallet so spot and perps share one
                    ledger. Authoritative for balances, positions, fills, and
                    risk.
                  </>
                }
              />
              <SysPart
                name="Ingester"
                body={
                  <>
                    Reads only the durable <Code>md:events</Code> stream and
                    writes Timescale: trades, BBO, and 1-minute candles. It
                    does not publish back to Redis.
                  </>
                }
              />
              <SysPart
                name="Redis"
                body={
                  <>
                    <Code>orders:commands</Code> (OMS → gateway),{" "}
                    <Code>orders:events</Code> (gateway → OMS),{" "}
                    <Code>md:events</Code> (gateway → ingester), and pub/sub
                    channels <Code>md:{"{market}"}:bbo</Code> and{" "}
                    <Code>md:{"{market}"}:trade</Code>.
                  </>
                }
              />
              <SysPart
                name="Postgres"
                body="Users from the web app. Orders and the command outbox from the OMS."
              />
              <SysPart
                name="TimescaleDB"
                body="Market history the desks chart. Independent of the live pub/sub fan-out."
              />
            </dl>
            <DiagramFocus
              src="/application-layer.svg"
              alt="Application layer: browser, web, OMS, engine gateway, ingester, Redis, Postgres, and TimescaleDB"
            />
          </DocSection>

          <DocSection id="path" title="Order path">
            <p>
              Place and cancel are commands with a durable handoff, so a
              restart can finish work that Redis has not acknowledged yet.
            </p>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                The BFF checks the session, then sends place or cancel to the
                OMS. Credit takes the same door.
              </li>
              <li>
                OMS writes order intent and an outbox row in one Postgres
                transaction, then appends the command to{" "}
                <Code>orders:commands</Code>.
              </li>
              <li>
                The gateway consumes the stream and posts to the exchange HTTP
                API. Duplicate and replayed commands are counted, not applied
                twice.
              </li>
              <li>
                MarketRuntime enqueues onto the shared command queue.
                OrderPlacementService runs, the WAL is appended, then every
                market WAL is fsync&apos;d and{" "}
                <Code>wallet.snapshot.json</Code> is saved once per batch.
              </li>
              <li>
                The in-process event bus feeds SSE. The gateway writes{" "}
                <Code>orders:events</Code>. The OMS updates product order
                state. Maker and taker share a trade id and are stored per
                order.
              </li>
            </ol>
            <p>
              The engine decides what matched. The OMS is the projection the
              desk renders and can replay. A cancel is accepted only while the
              order is still pending, accepted, open, or partially filled, so
              a fill that lands first cannot be overwritten as a cancel.
            </p>
          </DocSection>

          <DocSection id="matching" title="Matching">
            <p>
              Prices and sizes are integers. The book is in memory. Disk is
              for recovery, not for the match itself. Reads (book, balances,
              mark, positions) do not enter the command queue.
            </p>
            <ul className="list-disc space-y-3 pl-5">
              <li>
                <Code>GTC</Code> rests. <Code>IOC</Code> fills what it can and
                cancels the rest. <Code>FOK</Code> fills the whole size or
                rejects. <Code>FOK_BUDGET</Code> is a market buy that must fill
                the requested quantity inside <Code>quoteBudget</Code>, or it
                rejects before any match.
              </li>
              <li>
                A spot market buy needs <Code>quoteBudget</Code>. A perp
                market order needs it on both sides, as a notional cap for
                margin.
              </li>
              <li>
                Place is idempotent on <Code>orderId</Code> plus intent. Credit
                with the same <Code>commandId</Code> does not apply twice. The
                gateway writes the outcome to Redis before it publishes, so a
                crash mid-flight replays that outcome instead of matching
                again.
              </li>
              <li>
                Maker and taker fills share one trade id and are stored as two
                order rows.
              </li>
            </ul>
          </DocSection>

          <DocSection id="credit" title="Paper credit">
            <p>
              “Add USD” and “Add SOL” on the home page post a credit command.
              The amount is written into the engine ledger, not into a UI
              counter.
            </p>
            <p>
              Available and locked balances are read back from the engine. An
              open spot order or perp margin keeps size reserved until fill,
              cancel, or liquidation.
            </p>
          </DocSection>

          <DocSection id="data" title="Live vs history">
            <p>
              Live market data is pub/sub for best bid/offer and trades. The
              SSE stream carries order, trade, BBO, credit, position,
              liquidation, and funding events. That is what the desk shows now.
              The exchange keeps a 4096-event ring for catch-up.
            </p>
            <p>
              History is the durable <Code>md:events</Code> stream. The
              ingester writes Timescale from it, so charts and the tape remain
              after the live fan-out is gone.
            </p>
            <p>
              On reconnect the browser asks the web app for a stream ticket,
              then opens an EventSource on the gateway. Catch-up uses{" "}
              <Code>streamSeq</Code>. If the ring was overrun, the gateway
              reconciles from the exchange HTTP API and the OMS applies the
              retained state.
            </p>
          </DocSection>

          <DocSection id="persist" title="Durability">
            <ul className="list-disc space-y-3 pl-5">
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  WAL, then one fsync
                </strong>{" "}
                — each command appends a WAL line with no fsync. After the
                batch, every market WAL is fsync&apos;d and the shared wallet
                snapshot is saved. Market snapshots are written every 1024
                sequences, not every order.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Boot
                </strong>{" "}
                — the exchange loads the market snapshot and{" "}
                <Code>wallet.snapshot.json</Code>, then replays the WAL tail.
                CREDIT, DEBIT, PLACE, CANCEL, LIQUIDATE, and FUNDING are all
                journaled.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  OMS outbox
                </strong>{" "}
                — the command row exists before Redis is asked to accept it.
                An OMS restart can publish again from Postgres.
              </li>
              <li>
                <strong className="font-medium text-zinc-950 dark:text-zinc-50">
                  Engine sequence
                </strong>{" "}
                — events carry a sequence so consumers can detect gaps. The
                gateway reconciles over HTTP. The event bus does not call the
                gateway.
              </li>
            </ul>
            <DiagramFocus
              src="/exchange-layer.svg"
              alt="Exchange layer: MarketRuntime, shared command queue, order placement, file WAL, snapshots, and the event bus feeding SSE"
            />
          </DocSection>

          <DocSection id="perps" title="Perp risk">
            <p>
              <Code>SOL-USD-PERP</Code> uses the same engine and the same
              wallet as spot. Margin, positions, mark, liquidation, and funding
              are checked with matching.
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                Opening a perp locks USD margin,{" "}
                <Code>ceil(notional / leverage)</Code>. Spot and perp share
                available and locked USD and SOL. The books and positions stay
                per market.
              </li>
              <li>
                Mark is the book mid, or the last trade. It drives unrealized
                PnL. A maintenance-margin breach force-closes the position at
                mark.
              </li>
              <li>
                Funding runs on the demo schedule, 100 bps of notional every
                60 seconds. When the rate is positive, longs pay shorts.
              </li>
            </ul>
          </DocSection>

          <DocSection id="observe" title="Observability">
            <p>
              Each service exposes counters and gauges, and writes one JSON log
              line per event. Prometheus scrapes the numbers. Promtail ships
              the logs to Loki. Grafana is where both are read, on the
              PaperDesk Operations dashboard.
            </p>
            <dl className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <SysPart
                name="Prometheus"
                body={
                  <>
                    Scrapes <Code>/metrics</Code> on the exchange, gateway,
                    OMS, and ingester, and <Code>/api/metrics</Code> on the web
                    app. Shared series include <Code>cex_service_up</Code>,
                    process uptime, and <Code>cex_dependency_ok</Code>. OMS
                    exports consumer lag on <Code>orders:events</Code>. The
                    ingester exports it on <Code>md:events</Code> (
                    <Code>cex_stream_lag</Code>,{" "}
                    <Code>cex_stream_pending</Code>). The gateway reports
                    command backlog age, command outcomes, SSE connection,
                    reconnects, gap reconciles, and BBO or trade publish
                    counts.
                  </>
                }
              />
              <SysPart
                name="Loki"
                body={
                  <>
                    Services log JSON with <Code>service</Code>,{" "}
                    <Code>level</Code>, and fields such as{" "}
                    <Code>requestId</Code>, <Code>orderId</Code>,{" "}
                    <Code>commandId</Code>, and <Code>market</Code>. Promtail
                    tails those process logs, labels them by service, and
                    pushes batches to Loki. A failed command can be found by
                    order id instead of by reading five terminals.
                  </>
                }
              />
              <SysPart
                name="Grafana"
                body="PaperDesk Operations queries both datasources. Fleet status is green when a process is answering /metrics. The same board shows dependency health, stream lag, and a live log panel per service: gateway commands and SSE, OMS lag on orders:events, ingester lag on md:events, then exchange and web. Metrics say something stalled. Logs say which command."
              />
            </dl>
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
  return (
    <code className="font-mono text-xs text-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  );
}

