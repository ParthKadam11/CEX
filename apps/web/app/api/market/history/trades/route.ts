import { NextRequest } from "next/server";
import {
  bffError,
  getAuthenticatedUserId,
  marketDataHeaders,
  marketDataUrl,
  relayResponse,
} from "@/lib/backend";
import { parseMarketParam } from "@/lib/markets";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return bffError(request, 401, "UNAUTHORIZED");

  const market = parseMarketParam(request.nextUrl.searchParams.get("market"));
  const limit = request.nextUrl.searchParams.get("limit");
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  try {
    const response = await fetch(
      `${marketDataUrl}/markets/${market}/trades${query}`,
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
