import { Connection } from "@solana/web3.js";
import axios from "axios";

const TOKEN_PRICE_REFRESH_INTERVAL = 60 * 1000; // every 1min
let LAST_UPDATED: number | null = null;
let prices: { [key: string]: { price: string } } = {};

export interface TokenDetails {
  name: string;
  mint: string;
  native: boolean;
  img: string;
}

export const SUPPORTED_TOKENS: TokenDetails[] = [
  {
    name: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    native: false,
    img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQZ8paXkHD6xnRdkKlQGdJ6e3Q6KQK8PVssgJ1xw-FWVQ&s=10",
  },
  {
    name: "USDT",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    native: false,
    img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRfvwFlo1CWySx5Uev01AqAOCzH34jk5LfUgQFkix3S_Q&s=10",
  },
  {
    name: "SOL",
    mint: "So11111111111111111111111111111111111111112",
    native: true,
    img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRwtBlnZmA0L-S_6bgrfmiN-z30TwY9pS-7EyZRGTF5hA&s=10",
  },
];

// Prefer env RPC; default mainnet (matches supported token mints)
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  process.env.SOLANA_RPC_URL ??
  "https://api.mainnet-beta.solana.com";

export const connection = new Connection(SOLANA_RPC_URL);

export async function getSupportedTokens() {
  if (
    !LAST_UPDATED ||
    new Date().getTime() - LAST_UPDATED > TOKEN_PRICE_REFRESH_INTERVAL
  ) {
    const response = await axios.get<{ symbol: string; price: string }[]>(
      "https://api.binance.com/api/v3/ticker/price",
      {
        params: {
          symbols: '["SOLUSDT","USDCUSDT"]',
        },
      },
    );
    const tickers = Object.fromEntries(
      response.data.map((t) => [t.symbol, t.price]),
    ) as Record<string, string>;
    prices = {
      SOL: { price: tickers.SOLUSDT ?? "0" },
      USDC: { price: tickers.USDCUSDT ?? "1" },
      USDT: { price: "1" },
    };
    LAST_UPDATED = new Date().getTime();
  }
  return SUPPORTED_TOKENS.map((s) => ({
    ...s,
    price: prices[s.name]?.price ?? "0",
  }));
}
