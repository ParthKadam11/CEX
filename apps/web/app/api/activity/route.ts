import { NextRequest, NextResponse } from "next/server";
import { connection, explorerCluster } from "@cex/solana";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

function accountKeyString(key: { pubkey: PublicKey | string }): string {
  return typeof key.pubkey === "string" ? key.pubkey : key.pubkey.toBase58();
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address);
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const signatures = await connection.getSignaturesForAddress(pubkey, {
      limit: 20,
    });

    const txs = await connection.getParsedTransactions(
      signatures.map((s) => s.signature),
      { maxSupportedTransactionVersion: 0, commitment: "confirmed" },
    );

    const cluster = explorerCluster();
    const activities = signatures.map((sig, i) => {
      const tx = txs[i];
      let direction: "in" | "out" | "unknown" = "unknown";
      let amount: number | null = null;

      if (tx?.meta && !tx.meta.err) {
        const keys = tx.transaction.message.accountKeys.map(accountKeyString);
        const idx = keys.indexOf(address);

        if (idx >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
          const deltaLamports =
            (tx.meta.postBalances[idx] ?? 0) - (tx.meta.preBalances[idx] ?? 0);
          if (Math.abs(deltaLamports) > 5000) {
            amount = Math.abs(deltaLamports) / LAMPORTS_PER_SOL;
            direction = deltaLamports > 0 ? "in" : "out";
          }
        }
      }

      const explorerUrl =
        `https://explorer.solana.com/tx/${sig.signature}` +
        (cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`);

      return {
        signature: sig.signature,
        shortSignature: `${sig.signature.slice(0, 4)}...${sig.signature.slice(-4)}`,
        blockTime: sig.blockTime,
        status: sig.err ? "failed" : "success",
        direction,
        amount,
        symbol: "SOL",
        explorerUrl,
      };
    });

    return NextResponse.json({ activities });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load activity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
