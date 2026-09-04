"use client";

import { SessionProvider } from "next-auth/react";
import { SolanaProvider } from "@/components/SolanaProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

export default function Provider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <SolanaProvider>{children}</SolanaProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
