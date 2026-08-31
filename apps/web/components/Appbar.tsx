"use client";

import { Button } from "@/components/ui/button";
import { LayoutGrid, TrendingUp, Wallet } from "lucide-react";
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
  { label: "Trade", href: "/dashboard/trade", icon: TrendingUp },
  { label: "Apps", href: "/dashboard/apps", icon: LayoutGrid },
];

export const Appbar = () => {
  const session = useSession();
  const pathname = usePathname();

  const onDashboard = pathname.startsWith("/dashboard");

  return (
    <header className="absolute inset-x-0 top-0 z-20 px-5 pt-5 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display text-2xl tracking-tight text-white drop-shadow-sm"
        >
          CEX
        </Link>

        {onDashboard ? (
          <nav className="flex items-center gap-1 rounded-2xl border border-white/15 bg-slate-950/25 p-1 backdrop-blur-md">
            {dashboardLinks.map(({ label, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm font-medium transition-colors ${
                  pathname === href
                    ? "bg-white text-emerald-950"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        ) : (
          <nav className="hidden items-center gap-1 rounded-2xl border border-white/15 bg-slate-950/25 px-2 py-1.5 backdrop-blur-md md:flex">
            {marketingLinks.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="rounded-xl px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
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
              className="rounded-2xl bg-white text-emerald-950 hover:bg-white/90"
            >
              Logout
            </Button>
          ) : (
            <Button
              onClick={() => signIn()}
              className="rounded-2xl bg-white text-emerald-950 hover:bg-white/90"
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
