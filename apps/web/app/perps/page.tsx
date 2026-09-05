import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PerpsPanel } from "@/components/PerpsPanel";
import { authOptions } from "@/lib/auth";

export default async function PerpsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) redirect("/");

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-background">
      <section className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-4">
        <PerpsPanel />
      </section>
    </main>
  );
}
