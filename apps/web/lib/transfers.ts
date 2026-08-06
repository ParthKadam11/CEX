import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
} from "@solana/web3.js";
import { SUPPORTED_TOKENS } from "@cex/solana";

export function getSupportedToken(name: string) {
  const token = SUPPORTED_TOKENS.find((t) => t.name === name);
  if (!token) {
    throw new Error(`Unsupported token: ${name}`);
  }
  return token;
}

export async function buildTransferTransaction(params: {
  connection: Connection;
  tokenName: string;
  amount: number;
  from: PublicKey;
  to: PublicKey;
  /** Who pays for destination ATA creation (usually the fee payer / signer). */
  feePayer: PublicKey;
}): Promise<Transaction> {
  const { connection, tokenName, amount, from, to, feePayer } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  const token = getSupportedToken(tokenName);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction({
    feePayer,
    blockhash,
    lastValidBlockHeight,
  });

  if (token.native) {
    const lamports = Math.round(amount * 1e9);
    if (lamports <= 0) {
      throw new Error("Amount too small");
    }
    tx.add(
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: to,
        lamports,
      }),
    );
    return tx;
  }

  const mint = new PublicKey(token.mint);
  const mintInfo = await getMint(connection, mint);
  const rawAmount = BigInt(
    Math.round(amount * 10 ** mintInfo.decimals),
  );
  if (rawAmount <= 0n) {
    throw new Error("Amount too small");
  }

  const fromAta = getAssociatedTokenAddressSync(mint, from);
  const toAta = getAssociatedTokenAddressSync(mint, to);

  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      feePayer,
      toAta,
      to,
      mint,
    ),
    createTransferInstruction(fromAta, toAta, from, rawAmount),
  );

  return tx;
}
