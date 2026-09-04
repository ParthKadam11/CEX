import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import db from "@cex/db";
import { DashboardHome } from "@/components/DashboardHome";

async function getWallet() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.uid;

  if (!userId) {
    return null;
  }

  const wallet = await db.solWallet.findUnique({
    where: { userId },
    select: { publicKey: true },
  });

  return {
    publicKey: wallet?.publicKey ?? null,
  };
}

export default async function Dashboard() {
  const wallet = await getWallet();

  if (!wallet) {
    redirect("/");
  }

  return <DashboardHome publicKey={wallet.publicKey} />;
}
