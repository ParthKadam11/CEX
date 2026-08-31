import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { TradingPanel } from "@/components/TradingPanel";
import { authOptions } from "@/lib/auth";

export default async function TradePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) redirect("/");

  return <TradingPanel />;
}
