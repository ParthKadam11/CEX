/**
 * Low-load market ambience for demos/prod.
 * Places via gateway `/dev/inject-command` (synthetic users, no OMS User FK).
 *
 * Idle: slow cancel+requote + rare prints.
 * Presence (logged-in client on /trade): faster ticks + more prints.
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
const MM_USERS = [MM_BID_USER, MM_ASK_USER] as const;

const DEFAULT_MID = 100;
/** Tight ladder — enough to look like MMs without book bloat. */
const LADDER = [1, 2, 3, 5, 8] as const;
const SETTLE_MS = 60;
const PRESENCE_TTL_MS = 45_000;

export type SimIntensity = "idle" | "medium" | "high";

type BookBbo = {
  bestBid: number | null;
  bestAsk: number | null;
};

type SimState = {
  funded: boolean;
  ticks: number;
  lastMid: number;
};

type HeartbeatState = {
  enabled: boolean;
  /** Preferred intensity while viewers are present. */
  boost: "medium" | "high";
  lastPresenceAt: number;
  viewers: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  lastError: string | null;
  lastTickAt: number | null;
};

const globalSim = globalThis as unknown as {
  __cexMmSim?: SimState;
  __cexMmHeartbeat?: HeartbeatState;
};

function state(): SimState {
  if (!globalSim.__cexMmSim) {
    globalSim.__cexMmSim = { funded: false, ticks: 0, lastMid: DEFAULT_MID };
  }
  return globalSim.__cexMmSim;
}

function heartbeat(): HeartbeatState {
  if (!globalSim.__cexMmHeartbeat) {
    globalSim.__cexMmHeartbeat = {
      enabled: false,
      boost: "medium",
      lastPresenceAt: 0,
      viewers: 0,
      timer: null,
      inFlight: false,
      lastError: null,
      lastTickAt: null,
    };
  }
  return globalSim.__cexMmHeartbeat;
}

function hasActivePresence(hb: HeartbeatState): boolean {
  return Date.now() - hb.lastPresenceAt < PRESENCE_TTL_MS;
}

/** Effective intensity for the next tick. */
export function resolveEffectiveIntensity(): SimIntensity {
  const hb = heartbeat();
  if (!hasActivePresence(hb)) return "idle";
  return hb.boost;
}

function intervalFor(intensity: SimIntensity): number {
  if (intensity === "high") return 900;
  if (intensity === "medium") return 1_800;
  return 4_500;
}

function tradeChance(intensity: SimIntensity): number {
  if (intensity === "high") return 0.85;
  if (intensity === "medium") return 0.55;
  return 0.22;
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

/** Cancel only MM quotes so the book stays capped. */
async function cancelMmQuotes(): Promise<number> {
  const jobs: Promise<boolean>[] = [];
  for (const userId of MM_USERS) {
    const orders = await listOpenOrders(userId);
    for (const order of orders) {
      jobs.push(injectCancel(userId, order.orderId));
    }
  }
  if (jobs.length === 0) return 0;
  const results = await Promise.all(jobs);
  await sleep(SETTLE_MS);
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

/**
 * Legacy/manual tick used by the admin menu "Run one tick".
 * Prefer the heartbeat for continuous ambience.
 */
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
  const prints: { price: number; quantity: number }[] = [];

  const empty = bbo.bestBid == null && bbo.bestAsk == null;
  if (empty || placeQuotes) {
    await cancelMmQuotes();
    placed += await seedLadder(mid);
    seeded = true;
    await sleep(SETTLE_MS);
    book = await readBook();
  }

  const liveBbo = book?.bbo ?? bbo;
  if (
    placeTrades &&
    liveBbo.bestAsk != null &&
    liveBbo.bestBid != null
  ) {
    const jobs: Promise<boolean>[] = [];
    const tradeCount = intensityTradeCount(intensity);
    for (let i = 0; i < tradeCount; i += 1) {
      const buy = Math.random() < 0.5;
      const size = 1;
      const trader = pickRetail();
      const px = buy ? Number(liveBbo.bestAsk) : Number(liveBbo.bestBid);
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
    if (jobs.length > 0) {
      placed += (await Promise.all(jobs)).filter(Boolean).length;
      await sleep(SETTLE_MS);
      book = await readBook();
    }
  }

  // spreadBase unused after requote style — keep API stable
  void spreadBase;

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

/** One low-load heartbeat: replace MM ladder + maybe one retail print. */
export async function runHeartbeatTick(): Promise<{
  mid: number;
  placed: number;
  cancelled: number;
  traded: boolean;
  intensity: SimIntensity;
  book: OrderBookSnapshot | null;
  prints: { price: number; quantity: number }[];
}> {
  const intensity = resolveEffectiveIntensity();
  await ensureFunded();
  const s = state();
  let book = await readBook();
  const bbo = book?.bbo ?? { bestBid: null, bestAsk: null };
  let mid = resolveMid(bbo, s.lastMid || DEFAULT_MID);

  // Slight drift so the chart isn't flat forever.
  if (intensity !== "idle" && Math.random() < 0.35) {
    mid = Math.max(1, mid + (Math.random() < 0.5 ? -1 : 1));
  }
  s.lastMid = mid;

  const cancelled = await cancelMmQuotes();
  const placed = await seedLadder(mid);
  await sleep(SETTLE_MS);
  book = await readBook();

  const prints: { price: number; quantity: number }[] = [];
  let traded = false;
  const live = book?.bbo ?? bbo;
  if (
    live.bestAsk != null &&
    live.bestBid != null &&
    Math.random() < tradeChance(intensity)
  ) {
    const buy = Math.random() < 0.5;
    const px = buy ? Number(live.bestAsk) : Number(live.bestBid);
    const ok = await injectPlace({
      userId: pickRetail(),
      side: buy ? "BUY" : "SELL",
      price: px,
      quantity: 1,
      timeInForce: "IOC",
    });
    if (ok) {
      traded = true;
      prints.push({ price: px, quantity: 1 });
      await sleep(SETTLE_MS);
      book = await readBook();
    }
  }

  s.ticks += 1;
  const hb = heartbeat();
  hb.lastTickAt = Date.now();
  hb.lastError = null;

  return {
    mid: resolveMid(book?.bbo ?? live, mid),
    placed,
    cancelled,
    traded,
    intensity,
    book,
    prints,
  };
}

function scheduleNext(): void {
  const hb = heartbeat();
  if (!hb.enabled) return;
  if (hb.timer) clearTimeout(hb.timer);
  const ms = intervalFor(resolveEffectiveIntensity());
  hb.timer = setTimeout(() => {
    void loopOnce();
  }, ms);
}

async function loopOnce(): Promise<void> {
  const hb = heartbeat();
  if (!hb.enabled) return;
  if (hb.inFlight) {
    scheduleNext();
    return;
  }
  hb.inFlight = true;
  try {
    await runHeartbeatTick();
  } catch (error) {
    hb.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    hb.inFlight = false;
    scheduleNext();
  }
}

/** Start the always-on MM ambience loop (idempotent). */
export function startSimHeartbeat(): { started: boolean } {
  const hb = heartbeat();
  if (hb.enabled) return { started: false };
  hb.enabled = true;
  hb.lastError = null;
  void loopOnce();
  return { started: true };
}

export function stopSimHeartbeat(): { stopped: boolean } {
  const hb = heartbeat();
  if (!hb.enabled) return { stopped: false };
  hb.enabled = false;
  if (hb.timer) {
    clearTimeout(hb.timer);
    hb.timer = null;
  }
  return { stopped: true };
}

/**
 * Called from the trade UI while a signed-in user is watching.
 * Raises effective intensity until presence TTL expires.
 */
export function touchSimPresence(options?: {
  boost?: "medium" | "high";
}): {
  intensity: SimIntensity;
  boost: "medium" | "high";
} {
  const hb = heartbeat();
  hb.lastPresenceAt = Date.now();
  if (options?.boost === "high" || options?.boost === "medium") {
    hb.boost = options.boost;
  }
  // Nudge sooner when someone arrives.
  if (hb.enabled && !hb.inFlight) {
    if (hb.timer) clearTimeout(hb.timer);
    hb.timer = setTimeout(() => void loopOnce(), 200);
  }
  return {
    intensity: resolveEffectiveIntensity(),
    boost: hb.boost,
  };
}

export function getMarketMakerStatus() {
  const s = state();
  const hb = heartbeat();
  const intensity = resolveEffectiveIntensity();
  return {
    funded: s.funded,
    ticks: s.ticks,
    lastMid: s.lastMid,
    users: [...ALL_USERS],
    heartbeat: {
      enabled: hb.enabled,
      intensity,
      boost: hb.boost,
      viewersActive: hasActivePresence(hb),
      lastPresenceAt: hb.lastPresenceAt || null,
      lastTickAt: hb.lastTickAt,
      lastError: hb.lastError,
      intervalMs: intervalFor(intensity),
    },
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
