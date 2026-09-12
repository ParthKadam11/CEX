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

// Vercel preview / production: derive callback URL when NEXTAUTH_URL is unset.
if (!env("NEXTAUTH_URL") && env("VERCEL_URL")) {
  process.env.NEXTAUTH_URL = `https://${env("VERCEL_URL")}`
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
  if (!env("NEXTAUTH_URL") && !env("VERCEL_URL")) {
    throw new Error(
      "NEXTAUTH_URL is required in production (or deploy on Vercel so VERCEL_URL is set)",
    )
  }
}

/** Default @gmail.com; set AUTH_EMAIL_SUFFIX=@yourdomain.com (or empty to allow any). */
function emailAllowed(email: string): boolean {
  const suffix = process.env.AUTH_EMAIL_SUFFIX
  if (suffix === "") return true
  const required = suffix ?? "@gmail.com"
  return email.endsWith(required)
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
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      assertAuthEnv()
      if (account?.provider !== "google") {
        return false
      }

      const googleProfile = profile as GoogleProfile | undefined
      const email = user?.email as string
      if (!email || !emailAllowed(email)) {
        return false
      }

      try {
        let userDb = await db.user.findFirst({
          where: { username: email },
          select: { id: true },
        })
        if (!userDb) {
          userDb = await db.user.create({
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
        console.error("[auth] signIn failed", error)
        return false
      }
    },

    async jwt({ token, user }) {
      const email = user?.email ?? token.email
      if (email && !token.uid) {
        try {
          const dbUser = await db.user.findUnique({
            where: { email },
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
