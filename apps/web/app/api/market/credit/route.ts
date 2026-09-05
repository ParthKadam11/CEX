import { NextRequest, NextResponse } from "next/server";
import {
  bffError,
  engineGatewayHeaders,
  engineGatewayUrl,
  getAuthenticatedUserId,
} from "@/lib/backend";

const MAX_PAPER_CREDIT = 1_000_000;

/**
 * Paper-fund the authenticated user's engine ledger via gateway CREDIT inject.
 * Demo funding path for local/dev trading balances.
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
  if (asset !== "SOL" && asset !== "USD") {
    return bffError(request, 400, "INVALID_ASSET");
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_PAPER_CREDIT) {
    return bffError(request, 400, "INVALID_AMOUNT");
  }

  const command = {
    commandId: `web-credit-${crypto.randomUUID()}`,
    type: "CREDIT" as const,
    userId,
    asset,
    amount,
    timestamp: Date.now(),
  };

  try {
    const response = await fetch(`${engineGatewayUrl}/dev/inject-command`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...engineGatewayHeaders(userId, request.headers.get("x-request-id")),
      },
      body: JSON.stringify(command),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }

    return NextResponse.json(
      { commandId: command.commandId, asset, amount, ...payload },
      { status: 202 },
    );
  } catch {
    return bffError(request, 502, "ENGINE_GATEWAY_UNAVAILABLE");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
