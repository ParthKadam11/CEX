import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { HowItWorks } from "@/components/HowItWorks";

export default async function HowItWorksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.uid) {
    redirect("/");
  }

  return <HowItWorks />;
}
