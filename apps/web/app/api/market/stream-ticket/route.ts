import { NextRequest, NextResponse } from "next/server";
import { issueStreamTicket } from "@cex/app-contracts/stream-ticket";
import {
  bffError,
  engineGatewayPublicUrl,
  getAuthenticatedUserId,
  streamTicketSecret,
} from "@/lib/backend";
import { parseMarketParam } from "@/lib/markets";

export const dynamic = "force-dynamic";

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return true;
  }
}

/**
 * Issue a short-lived URL so the browser can EventSource the gateway directly
 * (avoids proxying long-lived SSE through the Next.js BFF / Vercel).
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
  }

  if (process.env.NODE_ENV === "production") {
    const configured =
      process.env.ENGINE_GATEWAY_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_ENGINE_GATEWAY_URL;
    if (!configured) {
      return bffError(
        request,
        502,
        "ENGINE_GATEWAY_PUBLIC_URL_REQUIRED",
        "Set ENGINE_GATEWAY_PUBLIC_URL to the public gateway origin for browser SSE",
      );
    }
    if (isLoopbackUrl(engineGatewayPublicUrl)) {
      return bffError(
        request,
        502,
        "ENGINE_GATEWAY_PUBLIC_URL_INVALID",
        "ENGINE_GATEWAY_PUBLIC_URL must be a public https origin in production",
      );
    }
  }

  const market = parseMarketParam(request.nextUrl.searchParams.get("market"));
  const { ticket, expiresAt } = issueStreamTicket(streamTicketSecret(), {
    market,
    userId,
  });

  const url = `${engineGatewayPublicUrl}/markets/${encodeURIComponent(market)}/stream?ticket=${encodeURIComponent(ticket)}`;

  return NextResponse.json(
    { url, market, expiresAt },
    {
      headers: {
        "cache-control": "no-store",
        "x-request-id":
          request.headers.get("x-request-id") ?? crypto.randomUUID(),
      },
    },
  );
}
