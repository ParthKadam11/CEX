import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedUserId,
  omsHeaders,
  omsUrl,
  relayResponse,
} from "@/lib/backend";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = request.nextUrl.searchParams.get("limit");
  const query = new URLSearchParams({ userId });
  if (limit) query.set("limit", limit);

  try {
    const response = await fetch(`${omsUrl}/orders?${query}`, {
      cache: "no-store",
      headers: omsHeaders(),
    });
    return relayResponse(response);
  } catch {
    return NextResponse.json(
      { error: "OMS_UNAVAILABLE" },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  try {
    const response = await fetch(`${omsUrl}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", ...omsHeaders() },
      body: JSON.stringify({ ...body, userId }),
    });
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
