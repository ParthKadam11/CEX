import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { OrdersPanel } from "@/components/OrdersPanel";

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) {
    redirect("/");
  }

  return <OrdersPanel />;
}
