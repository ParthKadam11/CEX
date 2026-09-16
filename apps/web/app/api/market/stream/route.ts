import { NextRequest } from "next/server";
import {
  bffError,
  engineGatewayHeaders,
  engineGatewayUrl,
  getAuthenticatedUserId,
} from "@/lib/backend";
import { parseMarketParam } from "@/lib/markets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dev-only BFF SSE proxy. Production browsers must use /api/market/stream-ticket
 * → ENGINE_GATEWAY_PUBLIC_URL (EventSource cannot go through Vercel reliably).
 */
export async function GET(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_BFF_MARKET_STREAM !== "true"
  ) {
    return bffError(
      request,
      503,
      "USE_DIRECT_SSE",
      "BFF market stream proxy is disabled in production; use /api/market/stream-ticket",
    );
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
  }

  const market = parseMarketParam(request.nextUrl.searchParams.get("market"));

  try {
    const response = await fetch(
      `${engineGatewayUrl}/markets/${market}/stream`,
      {
        cache: "no-store",
        headers: {
          accept: "text/event-stream",
          ...engineGatewayHeaders(
            undefined,
            request.headers.get("x-request-id"),
          ),
        },
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
        "content-type": "text/event-stream; charset=utf-8",
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
