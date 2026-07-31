import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import db from "@/app/db";
import { WalletCard } from "../components/WalletCard";

async function getBalance() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.uid;

  if (!userId) {
    return null;
  }

  const wallet = await db.solWallet.findUnique({
    where: { userId },
    select: { publicKey: true },
  });

  const inrWallet = await db.inrWallet.findUnique({
    where: { userId },
    select: { balance: true },
  });

  return {
    publicKey: wallet?.publicKey ?? null,
    inrBalance: inrWallet?.balance ?? 0,
  };
}

export default async function Dashboard() {
  const balance = await getBalance();

  if (!balance) {
    redirect("/");
  }

  return (
    <WalletCard
      publicKey={balance.publicKey}
      inrBalance={balance.inrBalance}
    />
  );
}
