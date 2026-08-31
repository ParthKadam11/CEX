import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const omsUrl = (
  process.env.OMS_URL ?? "http://127.0.0.1:4030"
).replace(/\/$/, "");

export const engineGatewayUrl = (
  process.env.ENGINE_GATEWAY_URL ?? "http://127.0.0.1:4020"
).replace(/\/$/, "");

export function omsHeaders(): HeadersInit {
  return process.env.OMS_INTERNAL_TOKEN
    ? { "x-internal-token": process.env.OMS_INTERNAL_TOKEN }
    : {};
}

export function engineGatewayHeaders(): HeadersInit {
  return process.env.ENGINE_GATEWAY_INTERNAL_TOKEN
    ? { "x-internal-token": process.env.ENGINE_GATEWAY_INTERNAL_TOKEN }
    : {};
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
