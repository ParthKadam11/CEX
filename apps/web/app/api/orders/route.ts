import { NextRequest } from "next/server";
import {
  getAuthenticatedUserId,
  bffError,
  omsHeaders,
  omsUrl,
  relayResponse,
} from "@/lib/backend";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
  }

  const limit = request.nextUrl.searchParams.get("limit");
  const query = new URLSearchParams();
  if (limit) query.set("limit", limit);

  try {
    const response = await fetch(`${omsUrl}/orders?${query}`, {
      cache: "no-store",
      headers: omsHeaders(userId, request.headers.get("x-request-id")),
    });
    return relayResponse(response);
  } catch {
    return bffError(request, 502, "OMS_UNAVAILABLE");
  }
}

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
    return bffError(request, 400, "INVALID_ORDER");
  }
  const orderBody = Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== "userId"),
  );

  try {
    const response = await fetch(`${omsUrl}/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...omsHeaders(userId, request.headers.get("x-request-id")),
      },
      body: JSON.stringify(orderBody),
    });
    return relayResponse(response);
  } catch {
    return bffError(request, 502, "OMS_UNAVAILABLE");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
