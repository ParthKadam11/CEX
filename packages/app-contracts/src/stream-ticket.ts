import { createHmac, timingSafeEqual } from "node:crypto";
import { isMarketSymbol, type MarketSymbol } from "@cex/exchange-types";

export type StreamTicketClaims = {
  market: MarketSymbol;
  exp: number;
  userId?: string;
};

const DEFAULT_TTL_MS = 120_000;

/** Short-lived HMAC ticket so browsers can open gateway SSE without the internal token. */
export function issueStreamTicket(
  secret: string,
  input: {
    market: MarketSymbol;
    userId?: string;
    ttlMs?: number;
    now?: number;
  },
): { ticket: string; expiresAt: number } {
  const now = input.now ?? Date.now();
  const expiresAt = now + (input.ttlMs ?? DEFAULT_TTL_MS);
  const claims: StreamTicketClaims = {
    market: input.market,
    exp: expiresAt,
    ...(input.userId ? { userId: input.userId } : {}),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString(
    "base64url",
  );
  const sig = sign(secret, payload);
  return { ticket: `${payload}.${sig}`, expiresAt };
}

export function verifyStreamTicket(
  secret: string,
  ticket: string,
  expectedMarket: string,
  now = Date.now(),
): StreamTicketClaims | null {
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  if (!payload || !sig) return null;

  const expected = sign(secret, payload);
  if (!safeEqual(sig, expected)) return null;

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(claims)) return null;
  if (!isMarketSymbol(claims.market) || claims.market !== expectedMarket) {
    return null;
  }
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
    return null;
  }
  if (claims.exp < now) return null;
  if (claims.userId !== undefined && typeof claims.userId !== "string") {
    return null;
  }

  return {
    market: claims.market,
    exp: claims.exp,
    ...(typeof claims.userId === "string" ? { userId: claims.userId } : {}),
  };
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
