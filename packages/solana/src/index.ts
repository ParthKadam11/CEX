import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

/** Devnet by default — this product uses test/devnet SOL only. */
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  process.env.SOLANA_RPC_URL ??
  "https://api.devnet.solana.com";

export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

export async function getSolBalance(address: string): Promise<number> {
  const lamports = await connection.getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

export function explorerCluster(): "devnet" | "testnet" | "mainnet-beta" {
  if (SOLANA_RPC_URL.includes("devnet")) return "devnet";
  if (SOLANA_RPC_URL.includes("testnet")) return "testnet";
  return "mainnet-beta";
}
