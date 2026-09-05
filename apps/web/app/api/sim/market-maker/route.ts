import { NextRequest, NextResponse } from "next/server";
import { bffError, getAuthenticatedUserId } from "@/lib/backend";
import {
  getMarketMakerStatus,
  runMarketMakerTick,
  type MarketMakerTickOptions,
} from "@/lib/sim/market-maker";

/**
 * Dev crowd / MM simulator — no extra process.
 * Client switch loops POST { action: "tick", ...options }.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");
  return NextResponse.json({ ok: true, ...getMarketMakerStatus() });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body ok for tick
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
