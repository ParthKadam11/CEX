/**
 * Market ambience for demos: MM sits on a dense resting order book.
 * Optional rare retail IOC prints when "Retail prints" is enabled.
 */

import type { OrderBookSnapshot } from "@cex/exchange-types";
import {
  engineGatewayHeaders,
  engineGatewayUrl,
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
/** Contiguous price offsets from mid — dense resting book. */
const LADDER_DEPTH = 18;
const SETTLE_MS = 20;
const PRESENCE_TTL_MS = 45_000;
/** Bump when MM accounts / funding change so hot-reload re-credits. */
const FUND_EPOCH = 2;
/** Bump when default MM behaviour changes (e.g. quotes-only). */
const DEFAULTS_EPOCH = 2;

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
    };
    bag.set(market, row);
  } else if (typeof row.fundEpoch !== "number") {
    row.fundEpoch = 0;
  }
  return row;
}

function heartbeat(): HeartbeatState {
  if (!globalSim.__cexMmHeartbeat) {
    globalSim.__cexMmHeartbeat = {
      enabled: false,
      boost: "medium",
      intervalMs: null,
      placeQuotes: true,
      placeTrades: false,
      spread: 1,
      lastPresenceAt: 0,
      viewers: 0,
      timer: null,
      inFlight: false,
      lastError: null,
      lastTickAt: null,
      defaultsEpoch: DEFAULTS_EPOCH,
    };
  } else if (globalSim.__cexMmHeartbeat.defaultsEpoch !== DEFAULTS_EPOCH) {
    // Quote-first: MM sits on the book; trades are opt-in.
    globalSim.__cexMmHeartbeat.placeTrades = false;
    globalSim.__cexMmHeartbeat.placeQuotes = true;
    globalSim.__cexMmHeartbeat.spread = Math.min(
      globalSim.__cexMmHeartbeat.spread || 1,
      2,
    );
    globalSim.__cexMmHeartbeat.defaultsEpoch = DEFAULTS_EPOCH;
  }
  return globalSim.__cexMmHeartbeat;
}

function hasActivePresence(hb: HeartbeatState): boolean {
  return Date.now() - hb.lastPresenceAt < PRESENCE_TTL_MS;
}

/** Effective intensity for the next tick. */
export function resolveEffectiveIntensity(): SimIntensity {
  const hb = heartbeat();
  if (!hasActivePresence(hb) && hb.intervalMs == null) return "idle";
  if (hb.boost === "low") return "idle";
  return hb.boost;
}

function intervalFor(intensity: SimIntensity): number {
  const hb = heartbeat();
  // Intensity defaults (ms). Speed override can only slow things down from these floors
  // when explicitly set higher — high stays snappy.
  const byIntensity =
    intensity === "high" ? 160 : intensity === "medium" ? 420 : 2_800;
  if (hb.intervalMs != null && hb.intervalMs > 0) {
    if (intensity === "high") return Math.min(hb.intervalMs, 220);
    return hb.intervalMs;
  }
  return byIntensity;
}

function tradeChance(intensity: SimIntensity): number {
  // Trades are optional ambience only — MM's job is resting quotes.
  if (intensity === "high") return 0.12;
  if (intensity === "medium") return 0.06;
  return 0.02;
}

function tradesPerTick(intensity: SimIntensity): number {
  if (intensity === "high") return Math.random() < 0.4 ? 1 : 0;
  return Math.random() < 0.2 ? 1 : 0;
}

function ladderQty(offset: number): number {
  return 2 + Math.floor(offset / 2) + (offset % 3);
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
    market: getSimMarket(),
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
): Promise<{ orderId: string; userId: string }[]> {
  const response = await fetch(
    `${engineGatewayUrl}/markets/${getSimMarket()}/orders?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store", headers: engineGatewayHeaders() },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as {
    orders?: { orderId: string; userId: string }[];
  };
  return Array.isArray(body.orders) ? body.orders : [];
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

async function ensureFunded(): Promise<void> {
  const s = state();
  if (s.funded && s.fundEpoch === FUND_EPOCH) return;

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

  await sleep(SETTLE_MS * 3);
  s.funded = true;
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

/** Place resting GTC quotes at every integer offset from mid (both MM stacks). */
async function seedLadder(mid: number): Promise<number> {
  const jobs: Array<() => Promise<boolean>> = [];
  for (let offset = 1; offset <= LADDER_DEPTH; offset += 1) {
    const bid = mid - offset;
    const ask = mid + offset;
    const qty = ladderQty(offset);
    for (const userId of MM_BID_USERS) {
      if (bid >= 1) {
        jobs.push(() =>
          injectPlace({
            userId,
            side: "BUY",
            price: bid,
            quantity: qty,
          }),
        );
      }
    }
    for (const userId of MM_ASK_USERS) {
      jobs.push(() =>
        injectPlace({
          userId,
          side: "SELL",
          price: ask,
          quantity: qty,
        }),
      );
    }
  }
  // Chunk so we don't stampede the gateway on cold start.
  let placed = 0;
  const CHUNK = 16;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const results = await Promise.all(jobs.slice(i, i + CHUNK).map((fn) => fn()));
    placed += results.filter(Boolean).length;
  }
  return placed;
}

/**
 * Fill missing ladder prices without wiping existing depth.
 * This is how the book gets thick quickly and stays that way.
 */
async function topUpLadder(
  mid: number,
  book: OrderBookSnapshot | null,
): Promise<number> {
  const { bids, asks } = bookPriceSets(book);
  const jobs: Array<() => Promise<boolean>> = [];
  for (let offset = 1; offset <= LADDER_DEPTH; offset += 1) {
    const bid = mid - offset;
    const ask = mid + offset;
    const qty = ladderQty(offset);
    if (bid >= 1 && !bids.has(bid)) {
      jobs.push(() =>
        injectPlace({
          userId: MM_BID_USERS[0]!,
          side: "BUY",
          price: bid,
          quantity: qty,
        }),
      );
      if (offset <= 8) {
        jobs.push(() =>
          injectPlace({
            userId: MM_BID_USERS[1]!,
            side: "BUY",
            price: bid,
            quantity: qty,
          }),
        );
      }
    }
    if (!asks.has(ask)) {
      jobs.push(() =>
        injectPlace({
          userId: MM_ASK_USERS[0]!,
          side: "SELL",
          price: ask,
          quantity: qty,
        }),
      );
      if (offset <= 8) {
        jobs.push(() =>
          injectPlace({
            userId: MM_ASK_USERS[1]!,
            side: "SELL",
            price: ask,
            quantity: qty,
          }),
        );
      }
    }
  }
  if (jobs.length === 0) return 0;
  const CHUNK = 16;
  let placed = 0;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const results = await Promise.all(jobs.slice(i, i + CHUNK).map((fn) => fn()));
    placed += results.filter(Boolean).length;
  }
  return placed;
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
    placed += await seedLadder(mid);
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

/** One low-load heartbeat: keep a stable MM ladder; trade / nudge without wiping the book. */
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
  let book = await readBook();
  const bbo = book?.bbo ?? { bestBid: null, bestAsk: null };
  let mid = resolveMid(bbo, s.lastMid || DEFAULT_MID);

  // Slight drift so the chart isn't flat forever (quotes follow; rare prints optional).
  if (intensity !== "idle" && Math.random() < (intensity === "high" ? 0.25 : 0.12)) {
    mid = Math.max(1, mid + (Math.random() < 0.5 ? -1 : 1));
  }
  s.lastMid = mid;

  let cancelled = 0;
  let placed = 0;
  const levels = bookPriceSets(book);
  const empty = levels.bidLevels === 0 && levels.askLevels === 0;
  const thin =
    levels.bidLevels < Math.floor(LADDER_DEPTH * 0.7) ||
    levels.askLevels < Math.floor(LADDER_DEPTH * 0.7);
  // Rare full rebuild — MM should sit on the book, not churn it.
  const rebuildEvery = intensity === "high" ? 80 : 120;
  const shouldRebuild = empty || s.ticks % rebuildEvery === 0;

  if (hb.placeQuotes && shouldRebuild) {
    cancelled = await cancelMmQuotes();
    placed = await seedLadder(mid);
    await sleep(SETTLE_MS);
    book = await readBook();
  } else if (hb.placeQuotes && (thin || intensity !== "idle")) {
    // Always top up missing ladder prices so depth fills / stays thick.
    placed = await topUpLadder(mid, book);
    if (placed > 0) {
      await sleep(SETTLE_MS);
      book = await readBook();
    }
  }

  const prints: { price: number; quantity: number }[] = [];
  let traded = false;
  let live = book?.bbo ?? bbo;
  // Optional rare retail prints — off by default; never the main MM job.
  if (hb.placeTrades) {
    const nTrades = tradesPerTick(intensity);
    for (let i = 0; i < nTrades; i++) {
      if (
        live.bestAsk == null ||
        live.bestBid == null ||
        Math.random() >= tradeChance(intensity)
      ) {
        continue;
      }
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
    scheduleNext(50);
    return;
  }
  hb.inFlight = true;
  // Wall-clock cadence: next tick is due from *start*, so slow engine
  // round-trips don't stack on top of the interval.
  const dueAt = Date.now() + intervalFor(resolveEffectiveIntensity());
  try {
    for (const market of SIM_MARKETS) {
      setSimMarket(market);
      await runHeartbeatTick();
    }
  } catch (error) {
    hb.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    hb.inFlight = false;
    scheduleNext(dueAt - Date.now());
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
  boost?: "low" | "medium" | "high";
}): {
  intensity: SimIntensity;
  boost: "low" | "medium" | "high";
} {
  const hb = heartbeat();
  hb.lastPresenceAt = Date.now();
  if (
    options?.boost === "high" ||
    options?.boost === "medium" ||
    options?.boost === "low"
  ) {
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
  // High should feel fast even if Speed was left on Normal/Slow.
  if (hb.boost === "high" && (hb.intervalMs == null || hb.intervalMs > 180)) {
    hb.intervalMs = 160;
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
  const s = state();
  s.funded = false;
  s.fundEpoch = 0;
  s.ticks = 0;
  s.lastMid = DEFAULT_MID;
  const hb = heartbeat();
  hb.lastError = null;
  hb.lastTickAt = null;
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
