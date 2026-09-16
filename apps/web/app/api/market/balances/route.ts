import { NextRequest } from "next/server";
import {
  bffError,
  engineGatewayHeaders,
  engineGatewayUrl,
  getAuthenticatedUserId,
  relayResponse,
} from "@/lib/backend";
import { parseMarketParam } from "@/lib/markets";

async function fetchBalances(
  market: string,
  userId: string,
  requestId: string | null,
): Promise<Response> {
  return fetch(`${engineGatewayUrl}/markets/${market}/balances`, {
    cache: "no-store",
    headers: engineGatewayHeaders(userId, requestId),
  });
}

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
  }

  const market = parseMarketParam(request.nextUrl.searchParams.get("market"));
  const requestId = request.headers.get("x-request-id");

  try {
    let response = await fetchBalances(market, userId, requestId);
    // One quick retry covers gateway↔exchange blips / cold starts.
    if (response.status === 502) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      response = await fetchBalances(market, userId, requestId);
    }
    return relayResponse(response);
  } catch {
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return relayResponse(await fetchBalances(market, userId, requestId));
    } catch {
      return bffError(request, 502, "ENGINE_GATEWAY_UNAVAILABLE");
    }
  }
}
