import { NextRequest } from "next/server";
import {
  buildSpotSwapOrder,
  isSpotSwapInput,
} from "@cex/app-contracts";
import {
  bffError,
  getAuthenticatedUserId,
  omsHeaders,
  omsUrl,
  relayResponse,
} from "@/lib/backend";

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bffError(request, 400, "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return bffError(request, 400, "INVALID_SWAP");
  }

  const input = {
    fromAsset: body.fromAsset,
    toAsset: body.toAsset,
    amount: body.amount,
    clientOrderId:
      typeof body.clientOrderId === "string"
        ? body.clientOrderId
        : `swap-${crypto.randomUUID()}`,
    fillMode: body.fillMode,
  };

  if (!isSpotSwapInput(input)) {
    return bffError(request, 400, "INVALID_SWAP");
  }

  const mapped = buildSpotSwapOrder(input);
  if ("error" in mapped) {
    return bffError(request, 400, mapped.error);
  }

  try {
    const response = await fetch(`${omsUrl}/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...omsHeaders(userId, request.headers.get("x-request-id")),
      },
      body: JSON.stringify(mapped),
    });

    if (!response.ok) return relayResponse(response);

    const result = (await response.json()) as Record<string, unknown>;
    return Response.json(
      {
        ...result,
        swap: {
          fromAsset: input.fromAsset,
          toAsset: input.toAsset,
          amount: input.amount,
          fillMode: input.fillMode ?? "IOC",
          order: mapped,
        },
      },
      {
        status: response.status,
        headers: response.headers.get("x-request-id")
          ? { "x-request-id": response.headers.get("x-request-id")! }
          : undefined,
      },
    );
  } catch {
    return bffError(request, 502, "OMS_UNAVAILABLE");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
