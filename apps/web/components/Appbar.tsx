"use client";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import {
  Activity,
  BookOpen,
  CandlestickChart,
  ListOrdered,
  Moon,
  Sun,
  Wallet,
  Wrench,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const appLinks = [
  { label: "Home", href: "/dashboard", icon: Wallet, match: "exact" as const },
  {
    label: "Spot",
    href: "/spot",
    icon: CandlestickChart,
    match: "prefix" as const,
  },
  { label: "Perps", href: "/perps", icon: Activity, match: "prefix" as const },
  {
    label: "Orders",
    href: "/dashboard/orders",
    icon: ListOrdered,
    match: "prefix" as const,
  },
  {
    label: "Guide",
    href: "/dashboard/apps",
    icon: BookOpen,
    match: "prefix" as const,
  },
  {
    label: "How it works",
    href: "/dashboard/how-it-works",
    icon: Wrench,
    match: "prefix" as const,
  },
];

export function Appbar({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const showAppNav = Boolean(session.data?.user);

  if (!showAppNav) {
    return (
      <>
        <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm supports-backdrop-filter:bg-background/80">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-3 sm:px-4">
            <Link href="/" className="font-display text-xl text-foreground">
              CEX
            </Link>
            <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
              <a href="#product" className="hover:text-foreground">
                Product
              </a>
              <a href="#markets" className="hover:text-foreground">
                Markets
              </a>
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
              <Button
                onClick={() => signIn()}
                className="h-8 rounded-md px-3 text-sm"
              >
                Sign in
              </Button>
            </div>
          </div>
        </header>
        {children}
      </>
    );
  }

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 flex h-dvh w-52 shrink-0 flex-col border-r border-border bg-background">
        <div className="flex h-14 items-center px-4">
          <Link
            href="/dashboard"
            className="font-display text-xl text-foreground"
          >
            CEX
          </Link>
        </div>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 px-2">
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
                  "inline-flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 border-t border-border p-3">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <Button
            onClick={() => signOut()}
            variant="outline"
            className="h-8 flex-1 rounded-md px-3 text-sm"
          >
            Log out
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ThemeToggle({
  theme,
  toggleTheme,
}: {
  theme: string;
  toggleTheme: () => void;
}) {
  return (
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
  );
}
