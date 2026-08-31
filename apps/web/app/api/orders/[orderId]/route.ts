import { NextRequest } from "next/server";
import {
  bffError,
  getAuthenticatedUserId,
  omsHeaders,
  omsUrl,
  relayResponse,
} from "@/lib/backend";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(_request, 401, "UNAUTHORIZED");
  }

  const { orderId } = await context.params;

  try {
    const response = await fetch(
      `${omsUrl}/orders/${encodeURIComponent(orderId)}`,
      {
        cache: "no-store",
        headers: omsHeaders(userId, _request.headers.get("x-request-id")),
      },
    );
    return relayResponse(response);
  } catch {
    return bffError(_request, 502, "OMS_UNAVAILABLE");
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return bffError(request, 400, "INVALID_JSON");
  }

  const { orderId } = await context.params;
  const clientOrderId =
    isRecord(body) && typeof body.clientOrderId === "string"
      ? body.clientOrderId
      : undefined;

  try {
    const response = await fetch(
      `${omsUrl}/orders/${encodeURIComponent(orderId)}`,
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          ...omsHeaders(userId, request.headers.get("x-request-id")),
        },
        body: JSON.stringify({ clientOrderId }),
      },
    );
    return relayResponse(response);
  } catch {
    return bffError(request, 502, "OMS_UNAVAILABLE");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
