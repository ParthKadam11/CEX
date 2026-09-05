import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { DashboardHome } from "@/components/DashboardHome";

export default async function Dashboard() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) {
    redirect("/");
  }

  return <DashboardHome />;
}
