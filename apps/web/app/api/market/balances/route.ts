import { NextRequest } from "next/server";
import {
  bffError,
  engineGatewayUrl,
  engineGatewayHeaders,
  getAuthenticatedUserId,
  relayResponse,
} from "@/lib/backend";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return bffError(request, 401, "UNAUTHORIZED");
  }

  try {
    const response = await fetch(
      `${engineGatewayUrl}/markets/SOL-USD/balances`,
      {
        cache: "no-store",
        headers: engineGatewayHeaders(userId, request.headers.get("x-request-id")),
      },
    );
    return relayResponse(response);
  } catch {
    return bffError(request, 502, "ENGINE_GATEWAY_UNAVAILABLE");
  }
}
