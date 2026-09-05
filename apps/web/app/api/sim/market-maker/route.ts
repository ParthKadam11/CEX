import { NextRequest, NextResponse } from "next/server";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";
import {
  clearSimOrderBook,
  configureSimOptions,
  getMarketMakerStatus,
  parseSimMarket,
  runMarketMakerTick,
  setSimMarket,
  startSimHeartbeat,
  stopSimHeartbeat,
  touchSimPresence,
  type MarketMakerTickOptions,
} from "@/lib/sim/market-maker";

/**
 * Dev / demo market ambience.
 * - Heartbeat runs in the Next.js Node process (see instrumentation.ts).
 * - Clients POST { action: "presence", market } while watching Spot/Perps.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");
  const market = parseSimMarket(request.nextUrl.searchParams.get("market"));
  setSimMarket(market);
  if (process.env.SIM_HEARTBEAT !== "false") {
    startSimHeartbeat();
  }
  return NextResponse.json({ ok: true, market, ...getMarketMakerStatus() });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body ok
  }

  const record =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const market = parseSimMarket(record.market);
  setSimMarket(market);

  const action =
    typeof record.action === "string" ? record.action : "tick";

  if (action === "status") {
    return NextResponse.json({ ok: true, market, ...getMarketMakerStatus() });
  }

  if (action === "presence") {
    const boost =
      record.boost === "high" ||
      record.boost === "medium" ||
      record.boost === "low"
        ? record.boost
        : undefined;
    const result = touchSimPresence(boost ? { boost } : undefined);
    startSimHeartbeat();
    return NextResponse.json({
      ok: true,
      market,
      ...result,
      ...getMarketMakerStatus(),
    });
  }

  if (action === "configure") {
    const status = configureSimOptions({
      intensity:
        record.intensity === "low" ||
        record.intensity === "medium" ||
        record.intensity === "high"
          ? record.intensity
          : undefined,
      intervalMs:
        typeof record.intervalMs === "number" && Number.isFinite(record.intervalMs)
          ? record.intervalMs
          : undefined,
      placeQuotes:
        typeof record.placeQuotes === "boolean"
          ? record.placeQuotes
          : undefined,
      placeTrades:
        typeof record.placeTrades === "boolean"
          ? record.placeTrades
          : undefined,
      spread:
        typeof record.spread === "number" && Number.isFinite(record.spread)
          ? record.spread
          : undefined,
    });
    return NextResponse.json({ ok: true, market, ...status });
  }

  if (action === "start") {
    const result = startSimHeartbeat();
    return NextResponse.json({
      ok: true,
      market,
      ...result,
      ...getMarketMakerStatus(),
    });
  }

  if (action === "stop") {
    const result = stopSimHeartbeat();
    return NextResponse.json({
      ok: true,
      market,
      ...result,
      ...getMarketMakerStatus(),
    });
  }

  if (action === "clear") {
    try {
      const result = await clearSimOrderBook(market);
      return NextResponse.json({ ok: true, market, ...result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "SIM_CLEAR_FAILED";
      return NextResponse.json(
        { error: { code: "SIM_CLEAR_FAILED", message } },
        { status: 502 },
      );
    }
  }

  if (action !== "tick" && action !== "seed") {
    return bffError(request, 400, "INVALID_ACTION");
  }

  const options: MarketMakerTickOptions = {
    market,
    placeQuotes: record.placeQuotes !== false,
    placeTrades: record.placeTrades === true,
    intensity:
      record.intensity === "low" ||
      record.intensity === "medium" ||
      record.intensity === "high"
        ? record.intensity
        : "medium",
    spread:
      typeof record.spread === "number" && Number.isFinite(record.spread)
        ? record.spread
        : undefined,
  };

  try {
    const result = await runMarketMakerTick(options);
    return NextResponse.json({ ok: true, market, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SIM_FAILED";
    return NextResponse.json(
      { error: { code: "SIM_FAILED", message } },
      { status: 502 },
    );
  }
}

