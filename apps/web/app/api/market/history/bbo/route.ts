import { NextRequest } from "next/server";
import {
  bffError,
  getAuthenticatedUserId,
  marketDataHeaders,
  marketDataUrl,
  relayResponse,
} from "@/lib/backend";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  const limit = request.nextUrl.searchParams.get("limit");
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  try {
    const response = await fetch(
      `${marketDataUrl}/markets/SOL-USD/bbo${query}`,
      {
        cache: "no-store",
        headers: marketDataHeaders(request.headers.get("x-request-id")),
      },
    );
    return relayResponse(response);
  } catch {
    return bffError(request, 502, "MARKET_DATA_UNAVAILABLE");
  }
}
