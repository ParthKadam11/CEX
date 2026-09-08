"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { Menu, Moon, Sun, X } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tradeLinks = [
  { label: "Home", href: "/dashboard", match: "exact" as const },
  { label: "Spot", href: "/spot", match: "prefix" as const },
  { label: "Perps", href: "/perps", match: "prefix" as const },
  { label: "Orders", href: "/dashboard/orders", match: "prefix" as const },
];

const docLinks = [
  { label: "Guide", href: "/dashboard/apps", match: "prefix" as const },
  {
    label: "System",
    href: "/dashboard/how-it-works",
    match: "prefix" as const,
  },
];

function isActive(
  pathname: string,
  href: string,
  match: "exact" | "prefix",
): boolean {
  if (match === "exact") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Appbar({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const showAppNav = Boolean(session.data?.user);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

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
    <div className="flex min-h-full flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-background px-3 md:hidden dark:border-zinc-800">
        <Link
          href="/dashboard"
          className="font-display text-lg tracking-tight text-zinc-950 dark:text-zinc-50"
        >
          CEX
        </Link>
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex size-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-zinc-950/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-zinc-200 bg-zinc-50 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex h-12 items-center justify-between px-4">
              <span className="font-display text-lg tracking-tight text-zinc-950 dark:text-zinc-50">
                CEX
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav
              aria-label="Primary"
              className="flex flex-1 flex-col gap-8 overflow-y-auto px-3 pb-4"
            >
              <NavGroup label="Trade" links={tradeLinks} pathname={pathname} />
              <NavGroup label="Learn" links={docLinks} pathname={pathname} />
            </nav>
            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={toggleTheme}
                className="text-xs text-zinc-500 transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
              >
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="text-xs text-zinc-500 transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
              >
                Log out
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-44 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/80 md:flex dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-14 items-center px-5">
          <Link
            href="/dashboard"
            className="font-display text-lg tracking-tight text-zinc-950 dark:text-zinc-50"
          >
            CEX
          </Link>
        </div>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-8 px-3">
          <NavGroup label="Trade" links={tradeLinks} pathname={pathname} />
          <NavGroup label="Learn" links={docLinks} pathname={pathname} />
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={toggleTheme}
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 bg-background">{children}</div>
    </div>
  );
}

function NavGroup({
  label,
  links,
  pathname,
}: {
  label: string;
  links: { label: string; href: string; match: "exact" | "prefix" }[];
  pathname: string;
}) {
  return (
    <div>
      <p className="mb-2 px-2 text-[10px] font-medium tracking-[0.14em] text-zinc-400 uppercase">
        {label}
      </p>
      <ul className="space-y-0.5">
        {links.map((link) => {
          const active = isActive(pathname, link.href, link.match);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "block rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "font-medium text-zinc-950 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
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
