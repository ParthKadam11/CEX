"use client";

import { Button } from "@/components/ui/button";
import { signIn } from "next-auth/react";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
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

          <Button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="mt-6 h-11 rounded-2xl bg-white px-6 text-emerald-950 hover:bg-white/90"
          >
            <GoogleIcon />
            Login with Google
          </Button>
        </div>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
