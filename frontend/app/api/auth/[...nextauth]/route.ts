import NextAuth, { type NextAuthOptions } from "next-auth"
import db from "@/app/db"
import GoogleProvider from "next-auth/providers/google"
import { Provider } from "@/generated/prisma/enums"
import {Keypair} from "@solana/web3.js"

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
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user?.email as string
        if (!email || !email.endsWith("@gmail.com")) {
          return false
        }
        const userDb = await db.user.findFirst({
          where: {
            username: email,
          },
        })
        if (userDb) {
          return true
        }

        const keypair =Keypair.generate()
        const publicKey = keypair.publicKey.toBase58()
        const privateKey = keypair.secretKey
        console.log(publicKey)
        console.log(privateKey)
        await db.user.create({
          data: {
            username: email,
            email,
            provider: Provider.Google,
            solwallet:{
              create:{
                publicKey:publicKey,
                privateKey: privateKey.toString() ,
              }
            },
            inrWallet:{
              create:{
                balance: 0
              }
            }

          },
        })

        return true
      }
      return false
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
