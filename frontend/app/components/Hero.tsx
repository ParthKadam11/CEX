"use client";

import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/ui/googleButton";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export function Hero() {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 animate-bg-drift bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/hero-bg.png')" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-950/35 via-transparent to-emerald-950/55"
      />

      <section className="relative z-10 flex min-h-screen flex-col items-center px-5 pb-16 pt-28 text-center sm:px-8 sm:pt-32">
        <h1 className="animate-fade-up font-display max-w-3xl text-5xl leading-[1.05] tracking-tight text-white [text-shadow:0_2px_24px_rgba(15,23,42,0.45)] sm:text-7xl">
          CEX
        </h1>

        <div className="animate-fade-up mt-auto flex w-full max-w-xl flex-col items-center delay-100">
          <p className="max-w-lg text-lg font-medium leading-relaxed tracking-wide text-white [text-shadow:0_1px_12px_rgba(15,23,42,0.55)] sm:text-xl">
            Better than your typical exchange clear markets and a calmer
            way to trade.
          </p>

          {session?.user ? (
            <Button
              onClick={() => router.push("/dashboard")}
              className="mt-6 h-11 rounded-2xl bg-white px-6 text-emerald-950 hover:bg-white/90"
            >
              Go to Dashboard
            </Button>
          ) : (
            <Button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="mt-6 h-11 rounded-2xl bg-white px-6 text-emerald-950 hover:bg-white/90"
            >
              <GoogleIcon />
              Login with Google
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
