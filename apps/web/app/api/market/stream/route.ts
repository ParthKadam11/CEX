import { NextRequest, NextResponse } from "next/server";
import {
  bffError,
  engineGatewayHeaders,
  engineGatewayUrl,
  getAuthenticatedUserId,
} from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
  }

  try {
    const response = await fetch(
      `${engineGatewayUrl}/markets/SOL-USD/stream`,
      {
        cache: "no-store",
        headers: engineGatewayHeaders(
          undefined,
          request.headers.get("x-request-id"),
        ),
      },
    );

    if (!response.ok || !response.body) {
      return bffError(request, 502, "MARKET_STREAM_UNAVAILABLE");
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream",
        "x-accel-buffering": "no",
        ...(response.headers.get("x-request-id")
          ? { "x-request-id": response.headers.get("x-request-id")! }
          : {}),
      },
    });
  } catch {
    return bffError(request, 502, "ENGINE_GATEWAY_UNAVAILABLE");
  }
}
