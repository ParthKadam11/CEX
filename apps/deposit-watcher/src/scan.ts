import { createConnection, lamportsToLots } from "@cex/solana";
import {
  PublicKey,
  type Commitment,
  type ConfirmedSignatureInfo,
} from "@solana/web3.js";

export type InboundTransfer = {
  signature: string;
  lamports: number;
  slot: number | null;
};

/** Fetch signatures newer than `afterSignature` (exclusive), oldest first. */
export async function listNewSignatures(
  address: string,
  afterSignature: string | null,
  limit = 40,
): Promise<ConfirmedSignatureInfo[]> {
  const conn = createConnection();
  const sigs = await conn.getSignaturesForAddress(new PublicKey(address), {
    limit,
  });
  const fresh: ConfirmedSignatureInfo[] = [];
  for (const sig of sigs) {
    if (afterSignature && sig.signature === afterSignature) break;
    if (sig.err) continue;
    fresh.push(sig);
  }
  return fresh.reverse();
}

export async function readInboundTransfer(
  signature: string,
  ownerAddress: string,
  commitment: Commitment = "confirmed",
): Promise<InboundTransfer | null> {
  const conn = createConnection(commitment);
  const tx = await conn.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: commitment === "finalized" ? "finalized" : "confirmed",
  });
  if (!tx || tx.meta?.err) return null;

  const keys = tx.transaction.message.accountKeys.map((key) =>
    key.pubkey.toBase58(),
  );
  const idx = keys.findIndex((key) => key === ownerAddress);
  if (idx < 0) return null;

  const pre = tx.meta?.preBalances[idx] ?? 0;
  const post = tx.meta?.postBalances[idx] ?? 0;
  const lamports = post - pre;
  if (lamports <= 0) return null;

  return {
    signature,
    lamports,
    slot: tx.slot ?? null,
  };
}

export function lotsFromLamports(lamports: number, minLots: number): number {
  const lots = lamportsToLots(lamports);
  return lots >= minLots ? lots : 0;
}
