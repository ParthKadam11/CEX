/**
 * Local crowd / MM simulator — no separate process.
 * Places via gateway `/dev/inject-command` (engine path) so synthetic
 * users do not need Postgres User rows (OMS FK would reject them).
 */

import type { OrderBookSnapshot } from "@cex/exchange-types";
import {
  engineGatewayHeaders,
  engineGatewayUrl,
} from "@/lib/backend";

export const MM_BID_USER = "sim-mm-bid";
export const MM_ASK_USER = "sim-mm-ask";
export const RETAIL_USERS = [
  "sim-trader-alice",
  "sim-trader-bob",
  "sim-trader-carol",
  "sim-trader-dave",
] as const;

const ALL_USERS = [MM_BID_USER, MM_ASK_USER, ...RETAIL_USERS] as const;

const DEFAULT_MID = 100;
const LADDER = [1, 2, 3, 5, 8] as const;
const SETTLE_MS = 80;

type BookBbo = {
  bestBid: number | null;
  bestAsk: number | null;
};

type SimState = {
  funded: boolean;
  ticks: number;
  lastMid: number;
};

const globalSim = globalThis as unknown as {
  __cexMmSim?: SimState;
};

function state(): SimState {
  if (!globalSim.__cexMmSim) {
    globalSim.__cexMmSim = { funded: false, ticks: 0, lastMid: DEFAULT_MID };
  }
  return globalSim.__cexMmSim;
}

async function inject(command: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${engineGatewayUrl}/dev/inject-command`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...engineGatewayHeaders(String(command.userId ?? "")),
    },
    body: JSON.stringify(command),
  });
  return response.ok || response.status === 202;
}

async function injectCredit(
  userId: string,
  asset: "USD" | "SOL",
  amount: number,
): Promise<boolean> {
  return inject({
    commandId: `sim-credit-${crypto.randomUUID()}`,
    type: "CREDIT",
    userId,
    asset,
    amount,
    timestamp: Date.now(),
  });
}

async function injectPlace(options: {
  userId: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  timeInForce?: "GTC" | "IOC";
}): Promise<boolean> {
  return inject({
    commandId: `sim-place-${crypto.randomUUID()}`,
    type: "PLACE",
    userId: options.userId,
    clientOrderId: `sim-${crypto.randomUUID()}`,
    market: "SOL-USD",
    side: options.side,
    orderType: "LIMIT",
    timeInForce: options.timeInForce ?? "GTC",
    price: options.price,
    quantity: options.quantity,
    orderId: crypto.randomUUID(),
    timestamp: Date.now(),
  });
}

async function injectCancel(userId: string, orderId: string): Promise<boolean> {
  return inject({
    commandId: `sim-cancel-${crypto.randomUUID()}`,
    type: "CANCEL",
    userId,
    orderId,
    market: "SOL-USD",
    timestamp: Date.now(),
  });
}

async function listOpenOrders(
  userId: string,
): Promise<{ orderId: string; userId: string }[]> {
  const response = await fetch(
    `${engineGatewayUrl}/markets/SOL-USD/orders?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store", headers: engineGatewayHeaders() },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as {
    orders?: { orderId: string; userId: string }[];
  };
  return Array.isArray(body.orders) ? body.orders : [];
}

async function readBook(): Promise<OrderBookSnapshot | null> {
  const response = await fetch(`${engineGatewayUrl}/markets/SOL-USD/book`, {
    cache: "no-store",
    headers: engineGatewayHeaders(),
  });
  if (!response.ok) return null;
  return (await response.json()) as OrderBookSnapshot;
}

function resolveMid(bbo: BookBbo, fallback: number): number {
  if (bbo.bestBid != null && bbo.bestAsk != null) {
    return Math.round((Number(bbo.bestBid) + Number(bbo.bestAsk)) / 2);
  }
  if (bbo.bestBid != null) return Number(bbo.bestBid);
  if (bbo.bestAsk != null) return Number(bbo.bestAsk);
  return fallback;
}

async function ensureFunded(): Promise<void> {
  const s = state();
  if (s.funded) return;

  await Promise.all([
    injectCredit(MM_BID_USER, "USD", 5_000_000),
    injectCredit(MM_ASK_USER, "SOL", 50_000),
    injectCredit(MM_BID_USER, "SOL", 5_000),
    injectCredit(MM_ASK_USER, "USD", 500_000),
    ...RETAIL_USERS.flatMap((user) => [
      injectCredit(user, "USD", 250_000),
      injectCredit(user, "SOL", 2_500),
    ]),
  ]);

  await sleep(SETTLE_MS * 3);
  s.funded = true;
}

async function seedLadder(mid: number): Promise<number> {
  const jobs: Promise<boolean>[] = [];
  for (const offset of LADDER) {
    const bid = mid - offset;
    const ask = mid + offset;
    if (bid >= 1) {
      jobs.push(
        injectPlace({
          userId: MM_BID_USER,
          side: "BUY",
          price: bid,
          quantity: 1 + (offset % 3),
        }),
      );
    }
    jobs.push(
      injectPlace({
        userId: MM_ASK_USER,
        side: "SELL",
        price: ask,
        quantity: 1 + (offset % 3),
      }),
    );
  }
  const results = await Promise.all(jobs);
  return results.filter(Boolean).length;
}

function pickRetail(): string {
  return RETAIL_USERS[Math.floor(Math.random() * RETAIL_USERS.length)]!;
}

export type MarketMakerTickOptions = {
  placeQuotes?: boolean;
  placeTrades?: boolean;
  intensity?: "low" | "medium" | "high";
  spread?: number;
};

function intensityTradeCount(intensity: "low" | "medium" | "high"): number {
  if (intensity === "low") return Math.random() < 0.5 ? 1 : 0;
  if (intensity === "high") return 2 + Math.floor(Math.random() * 3);
  return 1 + Math.floor(Math.random() * 2);
}

export async function runMarketMakerTick(
  options: MarketMakerTickOptions = {},
): Promise<{
  mid: number;
  placed: number;
  seeded: boolean;
  traded: boolean;
  ticks: number;
  book: OrderBookSnapshot | null;
  prints: { price: number; quantity: number }[];
}> {
  const placeQuotes = options.placeQuotes !== false;
  const placeTrades = options.placeTrades !== false;
  const intensity = options.intensity ?? "medium";
  const spreadBase = Math.max(1, Math.min(10, options.spread ?? 2));

  await ensureFunded();
  const s = state();
  let book = await readBook();
  const bbo = book?.bbo ?? { bestBid: null, bestAsk: null };
  const mid = resolveMid(bbo, s.lastMid || DEFAULT_MID);
  s.lastMid = mid;

  let placed = 0;
  let seeded = false;
  let traded = false;

  const empty =
    (bbo.bestBid == null && bbo.bestAsk == null) || s.ticks === 0;
  if (empty) {
    placed += await seedLadder(mid);
    seeded = true;
    await sleep(SETTLE_MS);
    book = await readBook();
    s.ticks += 1;
    return {
      mid: resolveMid(book?.bbo ?? bbo, mid),
      placed,
      seeded,
      traded,
      ticks: s.ticks,
      book,
      prints: [],
    };
  }

  const jobs: Promise<boolean>[] = [];
  const prints: { price: number; quantity: number }[] = [];

  if (placeQuotes) {
    const jitter = spreadBase + Math.floor(Math.random() * spreadBase);
    const qty = 1 + Math.floor(Math.random() * 4);
    jobs.push(
      injectPlace({
        userId: MM_BID_USER,
        side: "BUY",
        price: Math.max(1, mid - jitter),
        quantity: qty,
      }),
      injectPlace({
        userId: MM_ASK_USER,
        side: "SELL",
        price: mid + jitter,
        quantity: qty,
      }),
    );

    if (intensity !== "low" && Math.random() < 0.4) {
      const deep = spreadBase * 2 + Math.floor(Math.random() * 5);
      jobs.push(
        injectPlace({
          userId: MM_BID_USER,
          side: "BUY",
          price: Math.max(1, mid - deep),
          quantity: 2 + Math.floor(Math.random() * 3),
        }),
        injectPlace({
          userId: MM_ASK_USER,
          side: "SELL",
          price: mid + deep,
          quantity: 2 + Math.floor(Math.random() * 3),
        }),
      );
    }
  }

  if (placeTrades && bbo.bestAsk != null && bbo.bestBid != null) {
    const tradeCount = intensityTradeCount(intensity);
    for (let i = 0; i < tradeCount; i += 1) {
      const buy = Math.random() < 0.5;
      const size = 1 + Math.floor(Math.random() * 2);
      const trader = pickRetail();
      const px = buy ? Number(bbo.bestAsk) : Number(bbo.bestBid);
      jobs.push(
        injectPlace({
          userId: trader,
          side: buy ? "BUY" : "SELL",
          price: px,
          quantity: size,
          timeInForce: "IOC",
        }),
      );
      prints.push({ price: px, quantity: size });
      traded = true;
    }
  }

  if (jobs.length > 0) {
    const results = await Promise.all(jobs);
    placed += results.filter(Boolean).length;
    await sleep(SETTLE_MS);
    book = await readBook();
  }

  s.ticks += 1;

  return {
    mid: resolveMid(book?.bbo ?? bbo, mid),
    placed,
    seeded,
    traded,
    ticks: s.ticks,
    book,
    prints,
  };
}

export function getMarketMakerStatus() {
  const s = state();
  return {
    funded: s.funded,
    ticks: s.ticks,
    lastMid: s.lastMid,
    users: [...ALL_USERS],
  };
}

/** Cancel every resting order owned by sim users and reset tick state. */
export async function clearSimOrderBook(): Promise<{
  cancelled: number;
  book: OrderBookSnapshot | null;
}> {
  const jobs: Promise<boolean>[] = [];
  for (const userId of ALL_USERS) {
    const orders = await listOpenOrders(userId);
    for (const order of orders) {
      jobs.push(injectCancel(userId, order.orderId));
    }
  }

  const results = await Promise.all(jobs);
  const cancelled = results.filter(Boolean).length;
  await sleep(SETTLE_MS * 4);

  const s = state();
  s.ticks = 0;

  return { cancelled, book: await readBook() };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
