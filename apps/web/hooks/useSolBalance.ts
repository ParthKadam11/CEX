import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export function useSolBalance(address: string) {
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    connection
      .getBalance(new PublicKey(address))
      .then((lamports) => {
        if (cancelled) return;
        setBalance(lamports / LAMPORTS_PER_SOL);
        setError(null);
        setLoadedFor(address);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load SOL balance");
        setLoadedFor(address);
      });

    return () => {
      cancelled = true;
    };
  }, [address, connection, tick]);

  if (!address) {
    return { loading: false, balance: null, error: null, refetch };
  }

  const ready = loadedFor === address;

  return {
    loading: !ready,
    balance: ready ? balance : null,
    error: ready ? error : null,
    refetch,
  };
}
