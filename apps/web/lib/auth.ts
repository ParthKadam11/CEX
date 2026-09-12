import { type NextAuthOptions } from "next-auth"
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google"
import { Provider, prisma as db } from "@cex/db"

/**
 * Prefer bracket access so Next/Turbo cannot bake `undefined` into the
 * server bundle when a var was missing at `next build` time.
 */
function env(name: string): string | undefined {
  const value = process.env[name]
  return value && value.length > 0 ? value : undefined
}

const isProduction = process.env.NODE_ENV === "production"
/** `next build` sets this; secrets may be absent until runtime on Vercel. */
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build"

/**
 * Stable public origin for NextAuth callbacks.
 * Never prefer the per-deploy `*.vercel.app` host when a production alias exists —
 * that breaks Google redirect_uri (must match cex-web-phi.vercel.app).
 */
function resolveAuthUrl(): string | undefined {
  const explicit = env("NEXTAUTH_URL") ?? env("AUTH_URL")
  if (explicit) return explicit.replace(/\/$/, "")

  const productionHost = env("VERCEL_PROJECT_PRODUCTION_URL")
  if (env("VERCEL_ENV") === "production" && productionHost) {
    return `https://${productionHost.replace(/\/$/, "")}`
  }

  const vercelHost = env("VERCEL_URL")
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, "")}`

  return undefined
}

const authUrl = resolveAuthUrl()
if (authUrl) {
  process.env.NEXTAUTH_URL = authUrl
}

function assertAuthEnv(): void {
  if (!isProduction || isNextBuild) return
  for (const name of [
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ] as const) {
    if (name === "NEXTAUTH_SECRET") {
      if (!env("NEXTAUTH_SECRET") && !env("AUTH_SECRET")) {
        throw new Error("NEXTAUTH_SECRET is required in production")
      }
      continue
    }
    if (!env(name)) {
      throw new Error(`${name} is required in production`)
    }
  }
  if (!resolveAuthUrl()) {
    throw new Error(
      "NEXTAUTH_URL is required in production (or deploy on Vercel so VERCEL_URL is set)",
    )
  }
}

/** Set AUTH_EMAIL_SUFFIX=@gmail.com to restrict; unset/empty = allow any email. */
function emailAllowed(email: string): boolean {
  const suffix = process.env.AUTH_EMAIL_SUFFIX
  if (suffix === undefined || suffix === "") return true
  return email.toLowerCase().endsWith(suffix.toLowerCase())
}

export const authOptions: NextAuthOptions = {
  // next-auth also accepts AUTH_SECRET; prefer NEXTAUTH_SECRET.
  secret: env("NEXTAUTH_SECRET") ?? env("AUTH_SECRET"),
  providers: [
    GoogleProvider({
      clientId: env("GOOGLE_CLIENT_ID") ?? "",
      clientSecret: env("GOOGLE_CLIENT_SECRET") ?? "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  pages: {
    error: "/api/auth/signin",
  },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        assertAuthEnv()
      } catch (error) {
        console.error("[auth] env check failed", error)
        return "/api/auth/signin?error=Configuration"
      }

      if (account?.provider !== "google") {
        return false
      }

      const googleProfile = profile as GoogleProfile | undefined
      const email = (user?.email ?? "").trim().toLowerCase()
      if (!email) {
        console.error("[auth] Google account has no email")
        return "/api/auth/signin?error=EmailRequired"
      }
      if (!emailAllowed(email)) {
        console.error("[auth] email rejected by AUTH_EMAIL_SUFFIX", email)
        return "/api/auth/signin?error=AccessDenied"
      }

      if (!env("DATABASE_URL")) {
        console.error("[auth] DATABASE_URL missing on Vercel")
        return "/api/auth/signin?error=Configuration"
      }

      try {
        const existing = await db.user.findFirst({
          where: { OR: [{ email }, { username: email }] },
          select: { id: true },
        })
        if (!existing) {
          await db.user.create({
            data: {
              username: email,
              email,
              name: googleProfile?.name,
              profilePic: googleProfile?.picture,
              provider: Provider.Google,
            },
            select: { id: true },
          })
        }

        return true
      } catch (error) {
        console.error("[auth] signIn DB failed", error)
        return "/api/auth/signin?error=Configuration"
      }
    },

    async jwt({ token, user }) {
      const raw = user?.email ?? token.email
      const email = typeof raw === "string" ? raw.trim().toLowerCase() : undefined
      if (email && !token.uid) {
        try {
          const dbUser = await db.user.findFirst({
            where: { OR: [{ email }, { username: email }] },
            select: { id: true },
          })
          if (dbUser) {
            token.uid = dbUser.id
          }
        } catch (error) {
          console.error("[auth] jwt uid lookup failed", error)
        }
      }
      return token
    },

    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.uid = token.uid
      }
      return session
    },
  },
}
