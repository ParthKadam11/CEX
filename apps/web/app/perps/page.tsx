import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PerpsPanel } from "@/components/PerpsPanel";
import { authOptions } from "@/lib/auth";

export default async function PerpsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) redirect("/");

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background">
      <section className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col px-3 py-2 sm:px-4">
        <PerpsPanel />
      </section>
    </main>
  );
}
