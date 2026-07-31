"use client";

import { Button } from "@/components/ui/button";
import { LayoutGrid, Wallet } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const marketingLinks = [
  { label: "Markets", href: "#markets" },
  { label: "Trade", href: "#trade" },
  { label: "Earn", href: "#earn" },
  { label: "About", href: "#about" },
];

const dashboardLinks = [
  { label: "Wallet", href: "/dashboard", icon: Wallet },
  { label: "Apps", href: "/dashboard/apps", icon: LayoutGrid },
];

export const Appbar = () => {
  const session = useSession();
  const pathname = usePathname();

  const onHero = pathname === "/";
  const onDashboard = pathname.startsWith("/dashboard");

  return (
    <header className="absolute inset-x-0 top-0 z-20 px-5 pt-5 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link
          href="/"
          className={`font-display text-2xl tracking-tight ${
            onHero ? "text-white drop-shadow-sm" : "text-slate-900"
          }`}
        >
          CEX
        </Link>

        {onDashboard ? (
          <nav className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200/70">
            {dashboardLinks.map(({ label, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  pathname === href
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        ) : (
          <nav
            className={`hidden items-center gap-1 rounded-2xl border px-2 py-1.5 backdrop-blur-md md:flex ${
              onHero
                ? "border-white/15 bg-slate-950/25"
                : "border-slate-200 bg-white/70"
            }`}
          >
            {marketingLinks.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
                  onHero
                    ? "text-white/80 hover:bg-white/10 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {session.data?.user ? (
            <Button
              onClick={() => signOut()}
              className={`rounded-2xl ${
                onHero
                  ? "bg-white text-slate-900 hover:bg-white/90"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              Logout
            </Button>
          ) : (
            <Button
              onClick={() => signIn()}
              className={`rounded-2xl ${
                onHero
                  ? "bg-white text-slate-900 hover:bg-white/90"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
