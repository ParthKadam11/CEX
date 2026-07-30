"use client";

import { Button } from "@/components/ui/button";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

const links = ["Markets", "Trade", "Earn", "About"];

export const Appbar = () => {
  const session = useSession();

  return (
    <header className="absolute inset-x-0 top-0 z-20 px-5 pt-5 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display text-2xl tracking-tight text-white drop-shadow-sm"
        >
          CEX
        </Link>

        <nav className="hidden items-center gap-1 rounded-2xl border border-white/15 bg-slate-950/25 px-2 py-1.5 backdrop-blur-md md:flex">
          {links.map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              className="rounded-xl px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {session.data?.user ? (
            <Button
              onClick={() => signOut()}
              className="rounded-2xl bg-white text-slate-900 hover:bg-white/90"
            >
              Logout
            </Button>
          ) : (
            <Button
              onClick={() => signIn()}
              className="rounded-2xl bg-white text-slate-900 hover:bg-white/90"
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
