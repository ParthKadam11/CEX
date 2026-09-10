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

/**
 * Issue a short-lived URL so the browser can EventSource the gateway directly
 * (avoids proxying long-lived SSE through the Next.js BFF / Vercel).
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
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
