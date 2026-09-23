import { cookies } from "next/headers";
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const nextAuth = NextAuth(authOptions);

type RouteContext = { params: Promise<{ nextauth: string[] }> };

/**
 * Next drops extra Set-Cookie headers on this route. The OAuth state cookie
 * is one of them, so the first Google callback arrives without it and fails.
 * Re-apply every cookie through the Next cookie store, which keeps them all.
 */
async function handler(req: Request, context: RouteContext) {
  const response = await nextAuth(req, context);
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length === 0) return response;

  const store = await cookies();
  for (const header of setCookies) {
    const parsed = parseSetCookie(header);
    if (!parsed) continue;
    store.set(parsed.name, parsed.value, parsed.options);
  }

  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function parseSetCookie(header: string): {
  name: string;
  value: string;
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    path?: string;
    maxAge?: number;
    expires?: Date;
    sameSite?: "lax" | "strict" | "none";
  };
} | null {
  const [pair, ...attrs] = header.split(";").map((part) => part.trim());
  if (!pair) return null;
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name = pair.slice(0, eq);
  let value = pair.slice(eq + 1);
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep the raw value when it is not percent-encoded.
  }

  const options: {
    httpOnly?: boolean;
    secure?: boolean;
    path?: string;
    maxAge?: number;
    expires?: Date;
    sameSite?: "lax" | "strict" | "none";
  } = {};

  for (const attr of attrs) {
    const [rawKey, ...rest] = attr.split("=");
    const key = rawKey?.trim().toLowerCase();
    const raw = rest.join("=").trim();
    if (key === "httponly") options.httpOnly = true;
    else if (key === "secure") options.secure = true;
    else if (key === "path" && raw) options.path = raw;
    else if (key === "max-age" && raw) options.maxAge = Number(raw);
    else if (key === "expires" && raw) options.expires = new Date(raw);
    else if (key === "samesite") {
      const site = raw.toLowerCase();
      if (site === "lax" || site === "strict" || site === "none") {
        options.sameSite = site;
      }
    }
  }

  return { name, value, options };
}

export { handler as GET, handler as POST };
