import { NextResponse } from "next/server";
import {
  getAuthenticatedUserId,
  omsHeaders,
  omsUrl,
  relayResponse,
} from "@/lib/backend";

export async function POST() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(`${omsUrl}/funding/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", ...omsHeaders() },
      body: JSON.stringify({ userId }),
    });
    return relayResponse(response);
  } catch {
    return NextResponse.json(
      { error: "OMS_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
