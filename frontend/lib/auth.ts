import { type NextAuthOptions } from "next-auth"
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google"
import { Keypair } from "@solana/web3.js"
import { Provider } from "@/generated/prisma/enums"
import db from "@/app/db"

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

      const userDb = await db.user.findFirst({
        where: { username: email },
      })
      if (userDb) {
        return true
      }

      const keypair = Keypair.generate()

      await db.user.create({
        data: {
          username: email,
          email,
          name: googleProfile?.name,
          profilePic: googleProfile?.picture,
          provider: Provider.Google,
          solwallet: {
            create: {
              publicKey: keypair.publicKey.toBase58(),
              privateKey: keypair.secretKey.toString(),
            },
          },
          inrWallet: {
            create: { balance: 0 },
          },
        },
      })

      return true
    },

    async jwt({ token, user }) {
      const email = user?.email ?? token.email
      if (email && !token.uid) {
        const dbUser = await db.user.findUnique({
          where: { email },
          select: { id: true },
        })
        if (dbUser) {
          token.uid = dbUser.id
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
