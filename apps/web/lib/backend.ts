import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

const isProduction = process.env.NODE_ENV === "production";
/** Skip hard fails while `next build` collects page data (Turbo/Vercel). */
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";
const requireProdConfig = isProduction && !isNextBuild;

/**
 * Bracket access so Next cannot replace missing build-time secrets with
 * a baked-in `undefined` (Turbo strict mode often strips them during build).
 */
function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const omsUrl = requiredUrl(
  "OMS_URL",
  env("OMS_URL"),
  "http://127.0.0.1:4030",
);

export const engineGatewayUrl = requiredUrl(
  "ENGINE_GATEWAY_URL",
  env("ENGINE_GATEWAY_URL"),
  "http://127.0.0.1:4020",
);

export const marketDataUrl = requiredUrl(
  "MARKET_DATA_URL",
  env("MARKET_DATA_URL"),
  "http://127.0.0.1:4040",
);

/** Browser-reachable gateway origin for EventSource (defaults to ENGINE_GATEWAY_URL). */
export const engineGatewayPublicUrl = requiredUrl(
  "ENGINE_GATEWAY_PUBLIC_URL",
  env("ENGINE_GATEWAY_PUBLIC_URL") ??
    env("NEXT_PUBLIC_ENGINE_GATEWAY_URL") ??
    env("ENGINE_GATEWAY_URL"),
  "http://127.0.0.1:4020",
);

export function streamTicketSecret(): string {
  return requiredToken(
    "ENGINE_GATEWAY_INTERNAL_TOKEN",
    env("ENGINE_GATEWAY_INTERNAL_TOKEN"),
    "local-dev-gateway-token",
  );
}

export function omsHeaders(userId?: string, requestId?: string | null): HeadersInit {
  return {
    "x-internal-token": requiredToken(
      "OMS_INTERNAL_TOKEN",
      env("OMS_INTERNAL_TOKEN"),
      "local-dev-oms-token",
    ),
    ...(userId ? { "x-authenticated-user-id": userId } : {}),
    "x-request-id": requestId ?? crypto.randomUUID(),
  };
}

export function engineGatewayHeaders(
  userId?: string,
  requestId?: string | null,
): HeadersInit {
  return {
    "x-internal-token": requiredToken(
      "ENGINE_GATEWAY_INTERNAL_TOKEN",
      env("ENGINE_GATEWAY_INTERNAL_TOKEN"),
      "local-dev-gateway-token",
    ),
    ...(userId ? { "x-authenticated-user-id": userId } : {}),
    "x-request-id": requestId ?? crypto.randomUUID(),
  };
}

export function marketDataHeaders(requestId?: string | null): HeadersInit {
  return {
    "x-internal-token": requiredToken(
      "MARKET_DATA_INTERNAL_TOKEN",
      env("MARKET_DATA_INTERNAL_TOKEN"),
      "local-dev-market-data-token",
    ),
    "x-request-id": requestId ?? crypto.randomUUID(),
  };
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const { authOptions } = await import("@/lib/auth");
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
  status: 400 | 401 | 403 | 404 | 502,
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

function requiredUrl(name: string, value: string | undefined, fallback: string) {
  if (requireProdConfig && !value) {
    throw new Error(`${name} is required in production`);
  }
  return (value ?? fallback).replace(/\/$/, "");
}

function requiredToken(
  name: string,
  value: string | undefined,
  fallback: string,
): string {
  if (requireProdConfig && !value) {
    throw new Error(`${name} is required in production`);
  }
  return value ?? fallback;
}
