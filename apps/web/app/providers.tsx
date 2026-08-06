"use client";

import { SessionProvider } from "next-auth/react";
import { SolanaProvider } from "@/components/SolanaProvider";

export default function Provider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SolanaProvider>{children}</SolanaProvider>
    </SessionProvider>
  );
}
