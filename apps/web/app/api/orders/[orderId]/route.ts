import { NextRequest, NextResponse } from "next/server";
import {
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  const query = new URLSearchParams({ userId });

  try {
    const response = await fetch(
      `${omsUrl}/orders/${encodeURIComponent(orderId)}?${query}`,
      { cache: "no-store", headers: omsHeaders() },
    );
    return relayResponse(response);
  } catch {
    return NextResponse.json(
      { error: "OMS_UNAVAILABLE" },
      { status: 502 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
        headers: { "content-type": "application/json", ...omsHeaders() },
        body: JSON.stringify({ userId, clientOrderId }),
      },
    );
    return relayResponse(response);
  } catch {
    return NextResponse.json(
      { error: "OMS_UNAVAILABLE" },
      { status: 502 },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
