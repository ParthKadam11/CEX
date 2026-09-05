import { type NextAuthOptions } from "next-auth"
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google"
import { Provider, prisma as db } from "@cex/db"
import { STARTING_USD_BALANCE } from "@/lib/constants"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
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
      if (account?.provider !== "google") {
        return false
      }

      const googleProfile = profile as GoogleProfile | undefined
      const email = user?.email as string
      if (!email || !email.endsWith("@gmail.com")) {
        return false
      }

      try {
        const userDb = await db.user.findFirst({
          where: { username: email },
        })
        if (userDb) {
          return true
        }

        await db.user.create({
          data: {
            username: email,
            email,
            name: googleProfile?.name,
            profilePic: googleProfile?.picture,
            provider: Provider.Google,
            // Simulated USD quote currency (UsdWallet — DB only)
            usdWallet: {
              create: { balance: STARTING_USD_BALANCE },
            },
          },
        })

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
