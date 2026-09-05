"use client";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import {
  Activity,
  CandlestickChart,
  LayoutGrid,
  ListOrdered,
  Moon,
  Sun,
  Wallet,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const appLinks = [
  { label: "Home", href: "/dashboard", icon: Wallet, match: "exact" as const },
  { label: "Spot", href: "/spot", icon: CandlestickChart, match: "prefix" as const },
  { label: "Perps", href: "/perps", icon: Activity, match: "prefix" as const },
  { label: "Orders", href: "/dashboard/orders", icon: ListOrdered, match: "prefix" as const },
  { label: "Markets", href: "/dashboard/apps", icon: LayoutGrid, match: "prefix" as const },
];

export const Appbar = () => {
  const session = useSession();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const showAppNav = Boolean(session.data?.user);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-3 sm:px-4">
        <Link
          href={session.data?.user ? "/dashboard" : "/"}
          className="font-display text-xl text-balance text-foreground"
        >
          CEX
        </Link>

        {showAppNav ? (
          <nav
            aria-label="Primary"
            className="flex items-center gap-1 overflow-x-auto"
          >
            {appLinks.map(({ label, href, icon: Icon, match }) => {
              const active =
                match === "exact"
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
        ) : (
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#product" className="hover:text-foreground">
              Product
            </a>
            <a href="#markets" className="hover:text-foreground">
              Markets
            </a>
          </nav>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className="size-8 rounded-md p-0"
          >
            {theme === "dark" ? (
              <Sun className="size-3.5" />
            ) : (
              <Moon className="size-3.5" />
            )}
          </Button>
          {session.data?.user ? (
            <Button
              onClick={() => signOut()}
              variant="outline"
              className="h-8 rounded-md px-3 text-sm"
            >
              Log out
            </Button>
          ) : (
            <Button
              onClick={() => signIn()}
              className="h-8 rounded-md px-3 text-sm"
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
