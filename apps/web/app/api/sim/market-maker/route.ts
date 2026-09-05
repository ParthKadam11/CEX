import { NextRequest, NextResponse } from "next/server";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";
import {
  clearSimOrderBook,
  getMarketMakerStatus,
  runMarketMakerTick,
  startSimHeartbeat,
  stopSimHeartbeat,
  touchSimPresence,
  type MarketMakerTickOptions,
} from "@/lib/sim/market-maker";

/**
 * Dev / demo market ambience.
 * - Heartbeat runs in the Next.js Node process (see instrumentation.ts).
 * - Clients on /trade POST { action: "presence" } to raise intensity.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");
  // Ensure heartbeat lives in the same Node isolate as API routes.
  if (process.env.SIM_HEARTBEAT !== "false") {
    startSimHeartbeat();
  }
  return NextResponse.json({ ok: true, ...getMarketMakerStatus() });
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

  const action =
    typeof record.action === "string" ? record.action : "tick";

  if (action === "status") {
    return NextResponse.json({ ok: true, ...getMarketMakerStatus() });
  }

  if (action === "presence") {
    const boost =
      record.boost === "high" || record.boost === "medium"
        ? record.boost
        : "medium";
    const result = touchSimPresence({ boost });
    // Ensure heartbeat is on when a real user is watching.
    startSimHeartbeat();
    return NextResponse.json({
      ok: true,
      ...result,
      ...getMarketMakerStatus(),
    });
  }

  if (action === "start") {
    const result = startSimHeartbeat();
    return NextResponse.json({ ok: true, ...result, ...getMarketMakerStatus() });
  }

  if (action === "stop") {
    const result = stopSimHeartbeat();
    return NextResponse.json({ ok: true, ...result, ...getMarketMakerStatus() });
  }

  if (action === "clear") {
    try {
      const result = await clearSimOrderBook();
      return NextResponse.json({ ok: true, ...result });
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
    placeQuotes: record.placeQuotes !== false,
    placeTrades: record.placeTrades !== false,
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
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SIM_FAILED";
    return NextResponse.json(
      { error: { code: "SIM_FAILED", message } },
      { status: 502 },
    );
  }
}
