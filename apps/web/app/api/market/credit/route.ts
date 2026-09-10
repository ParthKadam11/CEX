import { NextRequest, NextResponse } from "next/server";
import {
  bffError,
  getAuthenticatedUserId,
  omsHeaders,
  omsUrl,
} from "@/lib/backend";
import { parseMarketParam } from "@/lib/markets";

const MAX_PAPER_CREDIT = 1_000_000;

/**
 * Paper-fund the authenticated user's engine ledger via OMS CREDIT.
 * Pass `market` to credit the spot or perp engine (separate ledgers).
 */
export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bffError(request, 400, "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return bffError(request, 400, "INVALID_CREDIT");
  }

  const asset = body.asset;
  const amount = Number(body.amount);
  const market = parseMarketParam(
    typeof body.market === "string" ? body.market : null,
  );
  if (asset !== "SOL" && asset !== "USD") {
    return bffError(request, 400, "INVALID_ASSET");
  }
  if (market === "SOL-USD-PERP" && asset !== "USD") {
    return bffError(request, 400, "PERP_USD_ONLY");
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_PAPER_CREDIT) {
    return bffError(request, 400, "INVALID_AMOUNT");
  }

  try {
    const response = await fetch(`${omsUrl}/credits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...omsHeaders(userId, request.headers.get("x-request-id")),
      },
      body: JSON.stringify({
        commandId: `web-credit-${crypto.randomUUID()}`,
        asset,
        amount,
        market,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }

    return NextResponse.json(
      { asset, amount, market, ...payload },
      { status: 202 },
    );
  } catch {
    return bffError(request, 502, "OMS_UNAVAILABLE");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
