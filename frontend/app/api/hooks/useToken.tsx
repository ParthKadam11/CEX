import { TokenDetails } from "@/lib/constants";
import axios from "axios";
import { useEffect, useState } from "react";

export interface TokenWithBalance extends TokenDetails {
  balance: number;
  usdBalance: number;
  price: string;
}

type TokenBalances = {
  totalBalance: number;
  tokens: TokenWithBalance[];
};

export function useTokens(address: string) {
  const [data, setData] = useState<(TokenBalances & { address: string }) | null>(
    null,
  );

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    axios.get(`/api/tokens?address=${address}`).then((res) => {
      if (!cancelled) {
        setData({ address, ...res.data });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address) {
    return { loading: false, tokenBalances: null };
  }

  const ready = data?.address === address;

  return {
    loading: !ready,
    tokenBalances: ready
      ? { totalBalance: data.totalBalance, tokens: data.tokens }
      : null,
  };
}
