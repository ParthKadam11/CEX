import { NextRequest, NextResponse } from "next/server";
import { connection, SOLANA_RPC_URL, SUPPORTED_TOKENS } from "@cex/solana";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const MINT_TO_SYMBOL = Object.fromEntries(
  SUPPORTED_TOKENS.filter((t) => !t.native).map((t) => [t.mint, t.name]),
);

function explorerCluster(): string {
  if (SOLANA_RPC_URL.includes("devnet")) return "devnet";
  if (SOLANA_RPC_URL.includes("testnet")) return "testnet";
  return "";
}

function accountKeyString(key: {
  pubkey: PublicKey | string;
}): string {
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
      let symbol = "SOL";

      if (tx?.meta && !tx.meta.err) {
        const keys = tx.transaction.message.accountKeys.map(accountKeyString);
        const idx = keys.indexOf(address);

        if (idx >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
          const deltaLamports =
            (tx.meta.postBalances[idx] ?? 0) - (tx.meta.preBalances[idx] ?? 0);
          // Ignore tiny fee-only changes when another asset moved; still show SOL if meaningful
          if (Math.abs(deltaLamports) > 5000) {
            amount = Math.abs(deltaLamports) / LAMPORTS_PER_SOL;
            direction = deltaLamports > 0 ? "in" : "out";
            symbol = "SOL";
          }
        }

        // Prefer SPL token delta for this owner when present
        const preToken = tx.meta.preTokenBalances ?? [];
        const postToken = tx.meta.postTokenBalances ?? [];
        const mints = new Set(
          [...preToken, ...postToken]
            .filter((b) => b.owner === address)
            .map((b) => b.mint),
        );

        for (const mint of mints) {
          const pre = preToken.find(
            (b) => b.owner === address && b.mint === mint,
          );
          const post = postToken.find(
            (b) => b.owner === address && b.mint === mint,
          );
          const preAmt = Number(pre?.uiTokenAmount.uiAmountString ?? 0);
          const postAmt = Number(post?.uiTokenAmount.uiAmountString ?? 0);
          const delta = postAmt - preAmt;
          if (delta === 0) continue;

          amount = Math.abs(delta);
          direction = delta > 0 ? "in" : "out";
          symbol = MINT_TO_SYMBOL[mint] ?? mint.slice(0, 4);
          break;
        }
      }

      const explorerBase = "https://explorer.solana.com/tx/";
      const explorerUrl =
        explorerBase +
        sig.signature +
        (cluster ? `?cluster=${cluster}` : "");

      return {
        signature: sig.signature,
        shortSignature: `${sig.signature.slice(0, 4)}...${sig.signature.slice(-4)}`,
        blockTime: sig.blockTime,
        status: sig.err ? "failed" : "success",
        direction,
        amount,
        symbol,
        explorerUrl,
      };
    });

    return NextResponse.json({ activities });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load activity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
