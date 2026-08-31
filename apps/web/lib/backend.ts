import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export const omsUrl = (
  process.env.OMS_URL ?? "http://127.0.0.1:4030"
).replace(/\/$/, "");

export const engineGatewayUrl = (
  process.env.ENGINE_GATEWAY_URL ?? "http://127.0.0.1:4020"
).replace(/\/$/, "");

export const marketDataUrl = (
  process.env.MARKET_DATA_URL ?? "http://127.0.0.1:4040"
).replace(/\/$/, "");

export function omsHeaders(userId?: string, requestId?: string | null): HeadersInit {
  return {
    "x-internal-token":
      process.env.OMS_INTERNAL_TOKEN ?? "local-dev-oms-token",
    ...(userId ? { "x-authenticated-user-id": userId } : {}),
    "x-request-id": requestId ?? crypto.randomUUID(),
  };
}

export function engineGatewayHeaders(
  userId?: string,
  requestId?: string | null,
): HeadersInit {
  return {
    "x-internal-token":
      process.env.ENGINE_GATEWAY_INTERNAL_TOKEN ??
      "local-dev-gateway-token",
    ...(userId ? { "x-authenticated-user-id": userId } : {}),
    "x-request-id": requestId ?? crypto.randomUUID(),
  };
}

export function marketDataHeaders(requestId?: string | null): HeadersInit {
  return {
    "x-internal-token":
      process.env.MARKET_DATA_INTERNAL_TOKEN ??
      "local-dev-market-data-token",
    "x-request-id": requestId ?? crypto.randomUUID(),
  };
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.uid ?? null;
}

export function relayResponse(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
      ...(response.headers.get("x-request-id")
        ? { "x-request-id": response.headers.get("x-request-id")! }
        : {}),
    },
  });
}

export function bffError(
  request: Request,
  status: 400 | 401 | 404 | 502,
  code: string,
  message = code,
) {
  const requestId =
    request.headers.get("x-request-id") ?? crypto.randomUUID();
  return NextResponse.json(
    { error: { code, message, requestId } },
    { status, headers: { "x-request-id": requestId } },
  );
}
