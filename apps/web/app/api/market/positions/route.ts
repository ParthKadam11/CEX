import { NextRequest } from "next/server";
import {
  bffError,
  engineGatewayHeaders,
  engineGatewayUrl,
  getAuthenticatedUserId,
  relayResponse,
} from "@/lib/backend";
import { parseMarketParam } from "@/lib/markets";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
  }

  const market = parseMarketParam(request.nextUrl.searchParams.get("market"));
  const queryUser = request.nextUrl.searchParams.get("userId");
  const query = queryUser
    ? `?userId=${encodeURIComponent(queryUser)}`
    : `?userId=${encodeURIComponent(userId)}`;

  try {
    const response = await fetch(
      `${engineGatewayUrl}/markets/${market}/positions${query}`,
      {
        cache: "no-store",
        headers: engineGatewayHeaders(
          userId,
          request.headers.get("x-request-id"),
        ),
      },
    );
    return relayResponse(response);
  } catch {
    return bffError(request, 502, "ENGINE_GATEWAY_UNAVAILABLE");
  }
}
