import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const omsUrl = (
  process.env.OMS_URL ?? "http://127.0.0.1:4030"
).replace(/\/$/, "");

export const engineGatewayUrl = (
  process.env.ENGINE_GATEWAY_URL ?? "http://127.0.0.1:4020"
).replace(/\/$/, "");

export function omsHeaders(userId?: string): HeadersInit {
  return {
    "x-internal-token":
      process.env.OMS_INTERNAL_TOKEN ?? "local-dev-oms-token",
    ...(userId ? { "x-authenticated-user-id": userId } : {}),
  };
}

export function engineGatewayHeaders(userId?: string): HeadersInit {
  return {
    "x-internal-token":
      process.env.ENGINE_GATEWAY_INTERNAL_TOKEN ??
      "local-dev-gateway-token",
    ...(userId ? { "x-authenticated-user-id": userId } : {}),
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
    },
  });
}
