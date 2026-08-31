import { NextResponse } from "next/server";
import {
  engineGatewayUrl,
  engineGatewayHeaders,
  getAuthenticatedUserId,
  relayResponse,
} from "@/lib/backend";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${engineGatewayUrl}/markets/SOL-USD/balances`,
      { cache: "no-store", headers: engineGatewayHeaders(userId) },
    );
    return relayResponse(response);
  } catch {
    return NextResponse.json(
      { error: "ENGINE_GATEWAY_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
