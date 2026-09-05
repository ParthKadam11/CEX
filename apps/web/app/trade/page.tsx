import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { TradingPanel } from "@/components/TradingPanel";
import { authOptions } from "@/lib/auth";

export default async function TradePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) redirect("/");

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background">
      <section className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4">
        <TradingPanel />
      </section>
    </main>
  );
}
