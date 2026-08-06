import { TokenDetails } from "@cex/solana";
import axios from "axios";
import { useCallback, useEffect, useState } from "react";

export interface TokenWithBalance extends TokenDetails {
  balance: number;
  usdBalance: number;
  price: string;
}

type TokenBalances = {
  totalBalance: number;
  tokens: TokenWithBalance[];
};

type LoadedBalances = TokenBalances & { address: string; tick: number };

type LoadError = { address: string; tick: number; message: string };

export function useTokens(address: string) {
  const [data, setData] = useState<LoadedBalances | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    axios
      .get(`/api/tokens?address=${address}`)
      .then((res) => {
        if (cancelled) return;
        setData({ address, tick, ...res.data });
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError({
          address,
          tick,
          message:
            e instanceof Error ? e.message : "Failed to load balances",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [address, tick]);

  if (!address) {
    return { loading: false, tokenBalances: null, error: null, refetch };
  }

  const ready = data?.address === address && data.tick === tick;
  const activeError =
    error?.address === address && error.tick === tick ? error.message : null;

  return {
    loading: !ready && !activeError,
    tokenBalances: ready
      ? { totalBalance: data.totalBalance, tokens: data.tokens }
      : null,
    error: activeError,
    refetch,
  };
}
