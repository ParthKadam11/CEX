"use client";

import { Button } from "@/components/ui/button";
import {
  LayoutGrid,
  ListOrdered,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const appLinks = [
  { label: "Home", href: "/dashboard", icon: Wallet },
  { label: "Trade", href: "/trade", icon: TrendingUp },
  { label: "Orders", href: "/dashboard/orders", icon: ListOrdered },
  { label: "Markets", href: "/dashboard/apps", icon: LayoutGrid },
];

export const Appbar = () => {
  const session = useSession();
  const pathname = usePathname();
  const showAppNav = Boolean(session.data?.user);

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href={session.data?.user ? "/dashboard" : "/"}
          className="font-display text-xl tracking-tight text-zinc-950"
        >
          CEX
        </Link>

        {showAppNav ? (
          <nav className="flex items-center gap-1 overflow-x-auto">
            {appLinks.map(({ label, href, icon: Icon }) => {
              const active =
                href === "/dashboard"
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={label}
                  href={href}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        ) : (
          <nav className="hidden items-center gap-6 text-sm text-zinc-500 md:flex">
            <a href="#product" className="hover:text-zinc-950">
              Product
            </a>
            <a href="#markets" className="hover:text-zinc-950">
              Markets
            </a>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {session.data?.user ? (
            <Button
              onClick={() => signOut()}
              variant="outline"
              className="h-8 rounded-md border-zinc-200 px-3 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Log out
            </Button>
          ) : (
            <Button
              onClick={() => signIn()}
              className="h-8 rounded-md bg-zinc-950 px-3 text-sm text-white hover:bg-zinc-800"
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
