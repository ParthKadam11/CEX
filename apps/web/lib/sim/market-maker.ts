/**
 * Market ambience for demos: MM sits on a dense resting order book.
 * Optional rare retail IOC prints when "Retail prints" is enabled.
 */

import type { OrderBookSnapshot } from "@cex/exchange-types";
import {
  engineGatewayHeaders,
  engineGatewayUrl,
  omsHeaders,
  omsUrl,
} from "@/lib/backend";
import {
  getSimMarket,
  isPerpMarket,
  parseSimMarket,
  setSimMarket,
  SIM_MARKETS,
} from "@/lib/sim/sim-market";

export const MM_BID_USER = "sim-mm-bid";
export const MM_ASK_USER = "sim-mm-ask";
/** Extra quote accounts so each price level can stack size. */
export const MM_BID_USERS = [MM_BID_USER, "sim-mm-bid-b"] as const;
export const MM_ASK_USERS = [MM_ASK_USER, "sim-mm-ask-b"] as const;
export const RETAIL_USERS = [
  "sim-trader-alice",
  "sim-trader-bob",
  "sim-trader-carol",
  "sim-trader-dave",
] as const;

const MM_USERS = [...MM_BID_USERS, ...MM_ASK_USERS] as const;
const ALL_USERS = [...MM_USERS, ...RETAIL_USERS] as const;

const DEFAULT_MID = 100;
/** Depth behind the inside — keep shallow so rebuilds stay cheap. */
const LADDER_DEPTH = 6;
const SETTLE_MS = 40;
const PRESENCE_TTL_MS = 45_000;
/** Bump when MM accounts / funding change so hot-reload re-credits. */
const FUND_EPOCH = 4;
/** Bump when default MM behaviour changes (e.g. prints-on by default). */
const DEFAULTS_EPOCH = 5;

export type SimIntensity = "idle" | "medium" | "high";

type BookBbo = {
  bestBid: number | null;
  bestAsk: number | null;
};

type SimState = {
  funded: boolean;
  fundEpoch: number;
  ticks: number;
  lastMid: number;
  /** Sticky drift so prints don't cancel out. -1 down, 0 mixed, +1 up. */
  trend: -1 | 0 | 1;
  lastSpread: number;
};

type HeartbeatState = {
  enabled: boolean;
  /** Preferred intensity while viewers are present / client boost. */
  boost: "low" | "medium" | "high";
  /** Tick interval override from UI speed control (ms). */
  intervalMs: number | null;
  placeQuotes: boolean;
  placeTrades: boolean;
  spread: number;
  lastPresenceAt: number;
  viewers: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  lastError: string | null;
  lastTickAt: number | null;
  defaultsEpoch: number;
  /** Alternates spot/perp so one tick never hammers both markets. */
  marketRotator: number;
};

const globalSim = globalThis as unknown as {
  __cexMmSim?: SimState;
  __cexMmSimByMarket?: Map<string, SimState>;
  __cexMmHeartbeat?: HeartbeatState;
};

function state(): SimState {
  const market = getSimMarket();
  const bag = (globalSim.__cexMmSimByMarket ??= new Map<string, SimState>());
  let row = bag.get(market);
  if (!row) {
    row = {
      funded: false,
      fundEpoch: 0,
      ticks: 0,
      lastMid: DEFAULT_MID,
      trend: 0,
      lastSpread: 2,
    };
    bag.set(market, row);
  } else if (typeof row.fundEpoch !== "number") {
    row.fundEpoch = 0;
  }
  if (row.trend !== -1 && row.trend !== 1) row.trend = 0;
  if (!Number.isFinite(row.lastSpread) || row.lastSpread < 1) row.lastSpread = 2;
  return row;
}

function heartbeat(): HeartbeatState {
  if (!globalSim.__cexMmHeartbeat) {
    globalSim.__cexMmHeartbeat = {
      enabled: false,
      boost: "medium",
      intervalMs: null,
      placeQuotes: true,
      placeTrades: true,
      spread: 2,
      lastPresenceAt: 0,
      viewers: 0,
      timer: null,
      inFlight: false,
      lastError: null,
      lastTickAt: null,
      defaultsEpoch: DEFAULTS_EPOCH,
      marketRotator: 0,
    };
  }
  const hb = globalSim.__cexMmHeartbeat!;
  // Hot-reload / epoch bump: reset leftover "enabled" so sim never auto-runs.
  if (hb.defaultsEpoch !== DEFAULTS_EPOCH) {
    if (hb.timer) {
      clearTimeout(hb.timer);
      hb.timer = null;
    }
    hb.enabled = false;
    hb.inFlight = false;
    hb.placeQuotes = true;
    hb.placeTrades = true;
    hb.spread = 2;
    hb.defaultsEpoch = DEFAULTS_EPOCH;
    hb.marketRotator = 0;
  }
  // Do not rewrite placeQuotes / placeTrades / spread on every call —
  // only the user (MM menu) may change sim options.
  return hb;
}

function hasActivePresence(hb: HeartbeatState): boolean {
  return Date.now() - hb.lastPresenceAt < PRESENCE_TTL_MS;
}

/** Effective intensity for the next tick. */
export function resolveEffectiveIntensity(): SimIntensity {
  const hb = heartbeat();
  // Keep ambience alive while the heartbeat is on — presence can still boost.
  if (hb.boost === "low") return "idle";
  if (hb.boost === "high") return hasActivePresence(hb) ? "high" : "medium";
  return "medium";
}

function intervalFor(intensity: SimIntensity): number {
  const hb = heartbeat();
  // Intensity defaults (ms). Speed override can only slow things down from these floors
  // when explicitly set higher — high stays snappy.
  const byIntensity =
    intensity === "high" ? 280 : intensity === "medium" ? 650 : 2_200;
  if (hb.intervalMs != null && hb.intervalMs > 0) {
    if (intensity === "high") return Math.min(hb.intervalMs, 320);
    return Math.max(hb.intervalMs, byIntensity);
  }
  return byIntensity;
}

function tradeChance(intensity: SimIntensity): number {
  // Retail prints drive the live chart — keep them frequent enough to feel alive.
  if (intensity === "high") return 0.7;
  if (intensity === "medium") return 0.45;
  return 0.18;
}

function tradesPerTick(intensity: SimIntensity): number {
  if (intensity === "high") return Math.random() < 0.55 ? 2 : 1;
  if (intensity === "medium") return Math.random() < 0.65 ? 1 : 0;
  return Math.random() < 0.35 ? 1 : 0;
}

function ladderQty(offset: number): number {
  const noise = Math.floor(Math.random() * 3);
  return Math.max(1, 1 + Math.floor(offset / 2) + noise);
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Mostly one tick, with a fat tail so some candles are much taller. */
function sampleStep(intensity: SimIntensity): number {
  const roll = Math.random();
  if (intensity === "idle") return roll < 0.85 ? 1 : 2;
  if (roll < 0.42) return 1;
  if (roll < 0.68) return 2;
  if (roll < 0.84) return randInt(3, 4);
  if (roll < 0.95) return randInt(5, 8);
  return randInt(9, 14);
}

/** Spread in ticks around the UI base — tight most of the time, occasionally wide. */
function sampleSpread(base: number, intensity: SimIntensity): number {
  const floor = 1;
  const cap = intensity === "high" ? 6 : 5;
  const center = Math.max(floor, Math.min(cap, Math.round(base)));
  const roll = Math.random();
  let next = center;
  if (roll < 0.12) next = Math.max(floor, center - 1);
  else if (roll < 0.55) next = center;
  else if (roll < 0.82) next = Math.min(cap, center + 1);
  else if (roll < 0.94) next = Math.min(cap, center + 2);
  else next = Math.min(cap, Math.max(center + 1, randInt(center, cap)));
  return Math.max(floor, Math.min(cap, next));
}

function stepFairPrice(s: SimState, intensity: SimIntensity): number {
  // Trends last many ticks. A coin-flip each tick pins the tape in a 2-wide box.
  const flip =
    intensity === "high" ? 0.07 : intensity === "medium" ? 0.045 : 0.02;
  if (s.trend === 0 || Math.random() < flip) {
    s.trend = Math.random() < 0.5 ? -1 : 1;
  }
  const moveChance =
    intensity === "high" ? 0.78 : intensity === "medium" ? 0.6 : 0.2;
  if (Math.random() >= moveChance) return s.lastMid;
  const mag = sampleStep(intensity);
  const dir = Math.random() < 0.84 ? s.trend : s.trend === 1 ? -1 : 1;
  s.lastMid = Math.max(20, Math.min(400, s.lastMid + dir * mag));
  return s.lastMid;
}

/** Split spread across bid/ask so the book isn't always perfectly symmetric. */
function quoteTouches(
  mid: number,
  spread: number,
): { bid: number; ask: number } {
  const wide = Math.max(1, Math.round(spread));
  if (wide === 1) {
    if (Math.random() < 0.5) {
      return { bid: Math.max(1, mid - 1), ask: Math.max(2, mid) };
    }
    return { bid: Math.max(1, mid), ask: mid + 1 };
  }
  let bidOff = Math.random() < 0.5 ? Math.floor(wide / 2) : Math.ceil(wide / 2);
  bidOff = Math.max(1, bidOff);
  const askOff = Math.max(1, wide - bidOff);
  const bid = Math.max(1, mid - bidOff);
  const ask = mid + askOff;
  if (ask <= bid) return { bid, ask: bid + 1 };
  return { bid, ask };
}

async function inject(command: Record<string, unknown>): Promise<boolean> {
  try {
    const requestId = crypto.randomUUID();
    const response = await fetch(`${engineGatewayUrl}/dev/inject-command`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...engineGatewayHeaders(String(command.userId ?? ""), requestId),
      },
      body: JSON.stringify({
        ...command,
        requestId:
          typeof command.requestId === "string"
            ? command.requestId
            : requestId,
      }),
    });
    return response.ok || response.status === 202;
  } catch {
    return false;
  }
}

async function injectCredit(
  userId: string,
  asset: "USD" | "SOL",
  amount: number,
): Promise<boolean> {
  try {
    const requestId = crypto.randomUUID();
    const response = await fetch(`${omsUrl}/credits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...omsHeaders(userId, requestId),
      },
      body: JSON.stringify({
        commandId: `sim-credit-${crypto.randomUUID()}`,
        asset,
        amount,
        market: getSimMarket(),
      }),
    });
    return response.ok || response.status === 202;
  } catch {
    return false;
  }
}

async function injectPlace(options: {
  userId: string;
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  timeInForce?: "GTC" | "IOC";
}): Promise<boolean> {
  const market = getSimMarket();
  const payload: Record<string, unknown> = {
    commandId: `sim-place-${crypto.randomUUID()}`,
    type: "PLACE",
    userId: options.userId,
    clientOrderId: `sim-${crypto.randomUUID()}`,
    market,
    side: options.side,
    orderType: "LIMIT",
    timeInForce: options.timeInForce ?? "GTC",
    price: options.price,
    quantity: options.quantity,
    orderId: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  if (isPerpMarket(market)) payload.leverage = 5;
  return inject(payload);
}

async function injectCancel(userId: string, orderId: string): Promise<boolean> {
  return inject({
    commandId: `sim-cancel-${crypto.randomUUID()}`,
    type: "CANCEL",
    userId,
    orderId,
    market: getSimMarket(),
    timestamp: Date.now(),
  });
}

async function listOpenOrders(
  userId: string,
): Promise<{ orderId: string; userId: string; price: number; side: string }[]> {
  const response = await fetch(
    `${engineGatewayUrl}/markets/${getSimMarket()}/orders?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store", headers: engineGatewayHeaders() },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as {
    orders?: {
      orderId: string;
      userId: string;
      price?: number;
      side?: string;
    }[];
  };
  if (!Array.isArray(body.orders)) return [];
  return body.orders.map((order) => ({
    orderId: order.orderId,
    userId: order.userId,
    price: Number(order.price),
    side: typeof order.side === "string" ? order.side : "",
  }));
}

async function readBook(): Promise<OrderBookSnapshot | null> {
  const response = await fetch(`${engineGatewayUrl}/markets/${getSimMarket()}/book`, {
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

async function availableBalance(
  userId: string,
  asset: "USD" | "SOL",
): Promise<number> {
  try {
    const response = await fetch(
      `${engineGatewayUrl}/markets/${getSimMarket()}/balances`,
      {
        cache: "no-store",
        headers: engineGatewayHeaders(userId),
      },
    );
    if (!response.ok) return 0;
    const body = (await response.json()) as {
      balances?: { asset: string; available: number }[];
    };
    const row = (body.balances ?? []).find((b) => b.asset === asset);
    return row && Number.isFinite(row.available) ? Number(row.available) : 0;
  } catch {
    return 0;
  }
}

async function hasWorkingBalance(): Promise<boolean> {
  if (isPerpMarket()) {
    return (await availableBalance(MM_BID_USER, "USD")) >= 1_000;
  }
  const [usd, sol] = await Promise.all([
    availableBalance(MM_BID_USER, "USD"),
    availableBalance(MM_ASK_USERS[0]!, "SOL"),
  ]);
  return usd >= 1_000 && sol >= 10;
}

async function ensureFunded(): Promise<void> {
  const s = state();
  if (s.funded && s.fundEpoch === FUND_EPOCH && (await hasWorkingBalance())) {
    return;
  }

  if (isPerpMarket()) {
    await Promise.all(
      ALL_USERS.map((user) => injectCredit(user, "USD", 10_000_000)),
    );
  } else {
    await Promise.all([
      ...MM_BID_USERS.flatMap((user) => [
        injectCredit(user, "USD", 10_000_000),
        injectCredit(user, "SOL", 10_000),
      ]),
      ...MM_ASK_USERS.flatMap((user) => [
        injectCredit(user, "SOL", 100_000),
        injectCredit(user, "USD", 1_000_000),
      ]),
      ...RETAIL_USERS.flatMap((user) => [
        injectCredit(user, "USD", 250_000),
        injectCredit(user, "SOL", 2_500),
      ]),
    ]);
  }

  // Credits go through the gateway Redis queue — wait until the engine
  // actually shows balances (nuclear wipe used to mark funded after 60ms).
  for (let i = 0; i < 40; i++) {
    if (await hasWorkingBalance()) break;
    await sleep(100);
  }
  s.funded = await hasWorkingBalance();
  s.fundEpoch = FUND_EPOCH;
}

function bookPriceSets(book: OrderBookSnapshot | null): {
  bids: Set<number>;
  asks: Set<number>;
  bidLevels: number;
  askLevels: number;
} {
  const bids = new Set(
    (book?.bids ?? []).map((l) => Number(l.price)).filter((p) => Number.isFinite(p)),
  );
  const asks = new Set(
    (book?.asks ?? []).map((l) => Number(l.price)).filter((p) => Number.isFinite(p)),
  );
  return {
    bids,
    asks,
    bidLevels: bids.size,
    askLevels: asks.size,
  };
}

/** Place resting GTC quotes around a sampled inside spread, then depth behind. */
async function seedLadder(mid: number, spread: number): Promise<number> {
  const inside = quoteTouches(mid, spread);
  const jobs: Array<() => Promise<boolean>> = [];
  jobs.push(() =>
    injectPlace({
      userId: MM_BID_USERS[0]!,
      side: "BUY",
      price: inside.bid,
      quantity: ladderQty(1),
    }),
  );
  jobs.push(() =>
    injectPlace({
      userId: MM_ASK_USERS[0]!,
      side: "SELL",
      price: inside.ask,
      quantity: ladderQty(1),
    }),
  );
  for (let step = 1; step <= LADDER_DEPTH; step += 1) {
    const bid = inside.bid - step;
    const ask = inside.ask + step;
    const qty = ladderQty(step + 1);
    if (bid >= 1) {
      jobs.push(() =>
        injectPlace({
          userId: MM_BID_USERS[0]!,
          side: "BUY",
          price: bid,
          quantity: qty,
        }),
      );
    }
    jobs.push(() =>
      injectPlace({
        userId: MM_ASK_USERS[0]!,
        side: "SELL",
        price: ask,
        quantity: qty,
      }),
    );
  }
  // Chunk so we don't stampede the gateway on cold start.
  let placed = 0;
  const CHUNK = 8;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const results = await Promise.all(jobs.slice(i, i + CHUNK).map((fn) => fn()));
    placed += results.filter(Boolean).length;
    await sleep(SETTLE_MS);
  }
  return placed;
}

/**
 * Fill missing ladder prices without wiping existing depth.
 * Near-touch levels get a second stack for thickness; far levels stay single.
 */
async function topUpLadder(
  mid: number,
  spread: number,
  book: OrderBookSnapshot | null,
): Promise<number> {
  const { bids, asks } = bookPriceSets(book);
  const inside = quoteTouches(mid, spread);
  const jobs: Array<() => Promise<boolean>> = [];
  const addBid = (price: number, qty: number, stacked: boolean) => {
    if (price < 1 || bids.has(price)) return;
    jobs.push(() =>
      injectPlace({
        userId: MM_BID_USERS[0]!,
        side: "BUY",
        price,
        quantity: qty,
      }),
    );
    if (stacked) {
      jobs.push(() =>
        injectPlace({
          userId: MM_BID_USERS[1]!,
          side: "BUY",
          price,
          quantity: qty,
        }),
      );
    }
  };
  const addAsk = (price: number, qty: number, stacked: boolean) => {
    if (asks.has(price)) return;
    jobs.push(() =>
      injectPlace({
        userId: MM_ASK_USERS[0]!,
        side: "SELL",
        price,
        quantity: qty,
      }),
    );
    if (stacked) {
      jobs.push(() =>
        injectPlace({
          userId: MM_ASK_USERS[1]!,
          side: "SELL",
          price,
          quantity: qty,
        }),
      );
    }
  };
  addBid(inside.bid, ladderQty(1), true);
  addAsk(inside.ask, ladderQty(1), true);
  for (let step = 1; step <= LADDER_DEPTH; step += 1) {
    addBid(inside.bid - step, ladderQty(step + 1), step <= 2);
    addAsk(inside.ask + step, ladderQty(step + 1), step <= 2);
  }
  if (jobs.length === 0) return 0;
  const CHUNK = 8;
  let placed = 0;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const results = await Promise.all(jobs.slice(i, i + CHUNK).map((fn) => fn()));
    placed += results.filter(Boolean).length;
    await sleep(SETTLE_MS);
  }
  return placed;
}

/** Cancel MM quotes in small batches — never stampede cancel-all. */
async function cancelMmQuotes(): Promise<number> {
  const jobs: Array<{ userId: string; orderId: string }> = [];
  for (const userId of MM_USERS) {
    const orders = await listOpenOrders(userId);
    for (const order of orders) {
      jobs.push({ userId, orderId: order.orderId });
    }
  }
  if (jobs.length === 0) return 0;
  let cancelled = 0;
  const CHUNK = 4;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const slice = jobs.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map((job) => injectCancel(job.userId, job.orderId)),
    );
    cancelled += results.filter(Boolean).length;
    await sleep(SETTLE_MS);
  }
  return cancelled;
}

function pickRetail(): string {
  return RETAIL_USERS[Math.floor(Math.random() * RETAIL_USERS.length)]!;
}

export type MarketMakerTickOptions = {
  market?: string;
  placeQuotes?: boolean;
  placeTrades?: boolean;
  intensity?: "low" | "medium" | "high";
  spread?: number;
};

export { parseSimMarket, setSimMarket, getSimMarket, SIM_MARKETS } from "@/lib/sim/sim-market";

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
  if (options.market) setSimMarket(parseSimMarket(options.market));
  const placeQuotes = options.placeQuotes !== false;
  const placeTrades = options.placeTrades === true;
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
  // Manual tick: only rebuild when empty; otherwise nudge + trade.
  if (empty) {
    await cancelMmQuotes();
    placed += await seedLadder(mid, spreadBase);
    seeded = true;
    await sleep(SETTLE_MS);
    book = await readBook();
  } else if (placeQuotes) {
    const jitter = spreadBase + Math.floor(Math.random() * spreadBase);
    const qty = 1 + Math.floor(Math.random() * 2);
    const results = await Promise.all([
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
    ]);
    placed += results.filter(Boolean).length;
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

const SWEEP_CAP = 48;
const RETIRE_CAP = 16;

/**
 * Trade through resting size that sits on the wrong side of fair.
 * One IOC can fill several prices, so the candle's range is the move.
 */
async function sweepToward(
  book: OrderBookSnapshot | null,
  targetMid: number,
): Promise<{ price: number; quantity: number }[]> {
  if (!book) return [];
  const bestAsk = book.bbo.bestAsk != null ? Number(book.bbo.bestAsk) : null;
  const bestBid = book.bbo.bestBid != null ? Number(book.bbo.bestBid) : null;

  let side: "BUY" | "SELL" | null = null;
  let limit = targetMid;
  let qty = 0;
  if (bestAsk != null && bestAsk < targetMid) {
    side = "BUY";
    limit = targetMid - 1;
    for (const level of book.asks ?? []) {
      const price = Number(level.price);
      const quantity = Number(level.quantity);
      if (price > limit || quantity <= 0) continue;
      qty += quantity;
    }
  } else if (bestBid != null && bestBid > targetMid) {
    side = "SELL";
    limit = targetMid + 1;
    for (const level of book.bids ?? []) {
      const price = Number(level.price);
      const quantity = Number(level.quantity);
      if (price < limit || quantity <= 0) continue;
      qty += quantity;
    }
  }
  const size = Math.min(qty, SWEEP_CAP);
  if (side == null || size < 1) return [];

  const ok = await injectPlace({
    userId: pickRetail(),
    side,
    price: limit,
    quantity: size,
    timeInForce: "IOC",
  });
  if (!ok) return [];
  return [{ price: limit, quantity: size }];
}

/**
 * Drop MM quotes that pin the touch or sit far from fair.
 * Capped so a tick never becomes a cancel storm.
 */
async function retireStaleQuotes(mid: number): Promise<number> {
  const bidFloor = mid - (LADDER_DEPTH + 3);
  const askCeil = mid + (LADDER_DEPTH + 3);
  const jobs: Array<{ userId: string; orderId: string; distance: number }> = [];

  for (const userId of MM_BID_USERS) {
    for (const order of await listOpenOrders(userId)) {
      if (!Number.isFinite(order.price)) continue;
      if (order.price >= mid || order.price < bidFloor) {
        jobs.push({
          userId,
          orderId: order.orderId,
          distance: Math.abs(order.price - mid),
        });
      }
    }
  }
  for (const userId of MM_ASK_USERS) {
    for (const order of await listOpenOrders(userId)) {
      if (!Number.isFinite(order.price)) continue;
      if (order.price <= mid || order.price > askCeil) {
        jobs.push({
          userId,
          orderId: order.orderId,
          distance: Math.abs(order.price - mid),
        });
      }
    }
  }

  jobs.sort((a, b) => a.distance - b.distance);
  const slice = jobs.slice(0, RETIRE_CAP);
  if (slice.length === 0) return 0;
  let cancelled = 0;
  const CHUNK = 4;
  for (let i = 0; i < slice.length; i += CHUNK) {
    const results = await Promise.all(
      slice.slice(i, i + CHUNK).map((job) => injectCancel(job.userId, job.orderId)),
    );
    cancelled += results.filter(Boolean).length;
  }
  return cancelled;
}

function noiseQty(intensity: SimIntensity): number {
  const roll = Math.random();
  if (roll < 0.55) return 1;
  if (roll < 0.8) return randInt(2, 3);
  if (roll < 0.93) return randInt(4, 7);
  return intensity === "high" ? randInt(8, 14) : randInt(4, 8);
}

/** One low-load heartbeat: walk a fair price and print through the book. */
export async function runHeartbeatTick(): Promise<{
  mid: number;
  placed: number;
  cancelled: number;
  traded: boolean;
  intensity: SimIntensity;
  book: OrderBookSnapshot | null;
  prints: { price: number; quantity: number }[];
}> {
  const hb = heartbeat();
  const intensity = resolveEffectiveIntensity();
  await ensureFunded();
  const s = state();
  if (!s.funded) {
    hb.lastError = "waiting for sim balances after credit";
    return {
      mid: s.lastMid || DEFAULT_MID,
      placed: 0,
      cancelled: 0,
      traded: false,
      intensity,
      book: await readBook(),
      prints: [],
    };
  }
  let book = await readBook();
  const bbo = book?.bbo ?? { bestBid: null, bestAsk: null };
  const bookMid = resolveMid(bbo, s.lastMid || DEFAULT_MID);
  if (!Number.isFinite(s.lastMid) || s.lastMid <= 0) s.lastMid = bookMid;
  // A person (or a wipe) moved the book a long way — follow that, then walk again.
  if (Math.abs(bookMid - s.lastMid) > 15) s.lastMid = bookMid;
  // Advance fair only once the touch has caught up, so a thick level gets cleared
  // before the target runs further away.
  const mid =
    intensity === "idle" || Math.abs(bookMid - s.lastMid) > 2
      ? s.lastMid
      : stepFairPrice(s, intensity);

  const spread = sampleSpread(hb.spread, intensity);
  s.lastSpread = spread;

  let cancelled = 0;
  let placed = 0;
  const levels = bookPriceSets(book);
  const empty = levels.bidLevels === 0 && levels.askLevels === 0;
  const thin =
    levels.bidLevels < Math.floor(LADDER_DEPTH * 0.5) ||
    levels.askLevels < Math.floor(LADDER_DEPTH * 0.5);
  // Only wipe+rebuild when the book is empty. Periodic rebuilds caused cancel
  // storms, circuit opens, and stuck command lag.
  const shouldRebuild = empty;

  if (hb.placeQuotes && shouldRebuild) {
    cancelled = await cancelMmQuotes();
    placed = await seedLadder(mid, spread);
    await sleep(SETTLE_MS);
    book = await readBook();
  } else if (hb.placeQuotes && thin) {
    // Top up missing ladder prices only when depth is thin.
    placed = await topUpLadder(mid, spread, book);
    if (placed > 0) {
      await sleep(SETTLE_MS);
      book = await readBook();
    }
  } else if (hb.placeQuotes && Math.abs(mid - bookMid) >= 1) {
    // Fair moved: fill only the new inside. Do not stack more size on the old touch.
    placed = await topUpLadder(mid, spread, book);
    if (placed > 0) {
      await sleep(SETTLE_MS);
      book = await readBook();
    }
  }

  const prints: { price: number; quantity: number }[] = [];
  let traded = false;
  let live = book?.bbo ?? bbo;
  // Pull the touch toward fair first, so prints land on a path instead of one bid/ask.
  if (hb.placeTrades && intensity !== "idle" && Math.abs(mid - bookMid) >= 1) {
    const swept = await sweepToward(book, mid);
    if (swept.length > 0) {
      traded = true;
      prints.push(...swept);
      await sleep(SETTLE_MS);
      book = await readBook();
      live = book?.bbo ?? live;
    }
    const retired = await retireStaleQuotes(mid);
    cancelled += retired;
    if (retired > 0) {
      await sleep(SETTLE_MS);
      book = await readBook();
      live = book?.bbo ?? live;
    }
  }
  // Quiet prints at the touch. Size and side follow the trend, so volume isn't stuck at 1.
  if (hb.placeTrades && live.bestAsk != null && live.bestBid != null) {
    const nTrades = tradesPerTick(intensity);
    const buyBias = s.trend === 1 ? 0.72 : s.trend === -1 ? 0.28 : 0.5;
    for (let i = 0; i < nTrades; i++) {
      if (Math.random() >= tradeChance(intensity)) continue;
      const buy = Math.random() < buyBias;
      const px = buy ? Number(live.bestAsk) : Number(live.bestBid);
      const size = noiseQty(intensity);
      const ok = await injectPlace({
        userId: pickRetail(),
        side: buy ? "BUY" : "SELL",
        price: px,
        quantity: size,
        timeInForce: "IOC",
      });
      if (ok) {
        traded = true;
        prints.push({ price: px, quantity: size });
        book = await readBook();
        live = book?.bbo ?? live;
      }
    }
  }

  s.ticks += 1;
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

function scheduleNext(delayMs?: number): void {
  const hb = heartbeat();
  if (!hb.enabled) return;
  if (hb.timer) clearTimeout(hb.timer);
  const ms =
    delayMs ?? intervalFor(resolveEffectiveIntensity());
  hb.timer = setTimeout(() => {
    void loopOnce();
  }, Math.max(0, ms));
}

async function loopOnce(): Promise<void> {
  const hb = heartbeat();
  if (!hb.enabled) return;
  if (hb.inFlight) {
    scheduleNext(120);
    return;
  }
  hb.inFlight = true;
  // Wall-clock cadence: next tick is due from *start*, so slow engine
  // round-trips don't stack on top of the interval.
  const dueAt = Date.now() + intervalFor(resolveEffectiveIntensity());
  try {
    // Alternate markets so we never stampede both books in one tick.
    const market = SIM_MARKETS[hb.marketRotator % SIM_MARKETS.length]!;
    hb.marketRotator += 1;
    setSimMarket(market);
    await runHeartbeatTick();
  } catch (error) {
    hb.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    hb.inFlight = false;
    scheduleNext(Math.max(80, dueAt - Date.now()));
  }
}

/** Start the always-on MM ambience loop (idempotent). */
export function startSimHeartbeat(options?: {
  intensity?: "low" | "medium" | "high";
  intervalMs?: number;
  placeQuotes?: boolean;
  placeTrades?: boolean;
  spread?: number;
}): { started: boolean } {
  if (options) configureSimOptions(options);
  const hb = heartbeat();
  // Starting with neither mode is a no-op — default to resting quotes.
  if (!hb.placeQuotes && !hb.placeTrades) {
    hb.placeQuotes = true;
  }
  hb.lastPresenceAt = Date.now();
  if (hb.enabled) {
    if (!hb.inFlight) {
      if (hb.timer) clearTimeout(hb.timer);
      hb.timer = setTimeout(() => void loopOnce(), 50);
    }
    return { started: false };
  }
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
 * Updates presence TTL only — does not start the sim or change options.
 */
export function touchSimPresence(options?: {
  boost?: "low" | "medium" | "high";
}): {
  intensity: SimIntensity;
  boost: "low" | "medium" | "high";
} {
  const hb = heartbeat();
  hb.lastPresenceAt = Date.now();
  // Boost only when the caller explicitly passes it (MM menu), never from page load.
  if (
    options?.boost === "high" ||
    options?.boost === "medium" ||
    options?.boost === "low"
  ) {
    hb.boost = options.boost;
  }
  if (hb.enabled && !hb.inFlight) {
    if (hb.timer) clearTimeout(hb.timer);
    hb.timer = setTimeout(() => void loopOnce(), 200);
  }
  return {
    intensity: resolveEffectiveIntensity(),
    boost: hb.boost,
  };
}

/** Apply Speed / Intensity / Spread / quote-trade toggles from the MM menu. */
export function configureSimOptions(options: {
  intensity?: "low" | "medium" | "high";
  intervalMs?: number;
  placeQuotes?: boolean;
  placeTrades?: boolean;
  spread?: number;
}): ReturnType<typeof getMarketMakerStatus> {
  const hb = heartbeat();
  if (
    options.intensity === "low" ||
    options.intensity === "medium" ||
    options.intensity === "high"
  ) {
    hb.boost = options.intensity;
    hb.lastPresenceAt = Date.now();
  }
  if (typeof options.intervalMs === "number" && options.intervalMs > 0) {
    hb.intervalMs = options.intervalMs;
  }
  if (typeof options.placeQuotes === "boolean") {
    hb.placeQuotes = options.placeQuotes;
  }
  if (typeof options.placeTrades === "boolean") {
    hb.placeTrades = options.placeTrades;
  }
  if (typeof options.spread === "number" && Number.isFinite(options.spread)) {
    hb.spread = Math.max(1, Math.min(10, options.spread));
  }
  if (hb.enabled && !hb.inFlight) {
    if (hb.timer) clearTimeout(hb.timer);
    hb.timer = setTimeout(() => void loopOnce(), 100);
  }
  return getMarketMakerStatus();
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
      placeQuotes: hb.placeQuotes,
      placeTrades: hb.placeTrades,
      spread: hb.spread,
      viewersActive: hasActivePresence(hb),
      lastPresenceAt: hb.lastPresenceAt || null,
      lastTickAt: hb.lastTickAt,
      lastError: hb.lastError,
      intervalMs: intervalFor(intensity),
    },
  };
}

/** Reset in-process sim counters so the next tick re-funds and re-seeds. */
export function resetSimRuntimeState(): void {
  const bag = globalSim.__cexMmSimByMarket;
  if (bag) {
    for (const row of bag.values()) {
      row.funded = false;
      row.fundEpoch = 0;
      row.ticks = 0;
      row.lastMid = DEFAULT_MID;
    }
  }
  // Also reset the active market row (creates it if the bag was empty).
  const s = state();
  s.funded = false;
  s.fundEpoch = 0;
  s.ticks = 0;
  s.lastMid = DEFAULT_MID;
  const hb = heartbeat();
  hb.lastError = null;
  hb.lastTickAt = null;
}

/**
 * After a nuclear wipe: re-credit every sim market and wait until balances land.
 * Call while the heartbeat is stopped so credits aren't buried behind places.
 */
export async function refundAllSimMarkets(): Promise<{
  ok: boolean;
  markets: Record<string, boolean>;
}> {
  resetSimRuntimeState();
  const markets: Record<string, boolean> = {};
  const previous = getSimMarket();
  try {
    for (const market of SIM_MARKETS) {
      setSimMarket(market);
      await ensureFunded();
      markets[market] = state().funded;
    }
  } finally {
    setSimMarket(previous);
  }
  return {
    ok: Object.values(markets).every(Boolean),
    markets,
  };
}

/** Cancel every resting order owned by sim users and reset tick state. */
export async function clearSimOrderBook(market?: string): Promise<{
  cancelled: number;
  book: OrderBookSnapshot | null;
}> {
  if (market) setSimMarket(parseSimMarket(market));
  const targets = market ? [getSimMarket()] : [...SIM_MARKETS];
  let cancelled = 0;
  let book: OrderBookSnapshot | null = null;
  for (const m of targets) {
    setSimMarket(m);
    const jobs: Promise<boolean>[] = [];
    for (const userId of ALL_USERS) {
      const orders = await listOpenOrders(userId);
      for (const order of orders) {
        jobs.push(injectCancel(userId, order.orderId));
      }
    }
    const results = await Promise.all(jobs);
    cancelled += results.filter(Boolean).length;
    await sleep(SETTLE_MS * 4);
    const s = state();
    s.ticks = 0;
    book = await readBook();
  }
  return { cancelled, book };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
