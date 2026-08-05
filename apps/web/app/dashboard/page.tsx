import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import db from "@cex/db";
import { WalletCard } from "@/components/WalletCard";

const TEST_PUBLIC_KEY =
  "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9"; //Binance (SOL + tokens)
// "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"; //large SOL holder
// "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S"; //Binance deposit
// "DYw8jCTfwHNRJhhmFcbXvVDTqUMEVFBX6ZKUmG5CNSKK"; //common demo wallet

async function getBalance() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.uid;

  if (!userId) {
    return null;
  }

  // const wallet = await db.solWallet.findUnique({
  //   where: { userId },
  //   select: { publicKey: true },
  // });

  const fiatWallet = await db.inrWallet.findUnique({
    where: { userId },
    select: { balance: true },
  });

  return {
    // publicKey: wallet?.publicKey ?? null,
    publicKey: TEST_PUBLIC_KEY,
    usdBalance: fiatWallet?.balance ?? 0,
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
      usdBalance={balance.usdBalance}
    />
  );
}
