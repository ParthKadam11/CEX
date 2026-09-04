import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { TradingPanel } from "@/components/TradingPanel";
import { authOptions } from "@/lib/auth";

export default async function TradePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) redirect("/");

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-white">
      <section className="mx-auto flex w-full max-w-6xl justify-center px-5 py-10 sm:px-8">
        <TradingPanel />
      </section>
    </main>
  );
}
