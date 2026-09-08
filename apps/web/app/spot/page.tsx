import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { TradingPanel } from "@/components/TradingPanel";
import { authOptions } from "@/lib/auth";

export default async function SpotPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) redirect("/");

  return (
    <main className="bg-background lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <section className="mx-auto flex w-full max-w-[1600px] flex-col px-2 py-2 sm:px-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-4">
        <TradingPanel />
      </section>
    </main>
  );
}
