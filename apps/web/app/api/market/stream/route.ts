import { NextResponse } from "next/server";
import {
  engineGatewayHeaders,
  engineGatewayUrl,
  getAuthenticatedUserId,
} from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${engineGatewayUrl}/markets/SOL-USD/stream`,
      {
        cache: "no-store",
        headers: engineGatewayHeaders(),
      },
    );

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: "MARKET_STREAM_UNAVAILABLE" },
        { status: 502 },
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream",
        "x-accel-buffering": "no",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "ENGINE_GATEWAY_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
