import {
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
} from "@solana/web3.js";

/** Build a native SOL transfer (custodial deposit / withdraw). */
export async function buildSolTransfer(params: {
  connection: Connection;
  amount: number;
  from: PublicKey;
  to: PublicKey;
  feePayer: PublicKey;
}): Promise<Transaction> {
  const { connection, amount, from, to, feePayer } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  const lamports = Math.round(amount * 1e9);
  if (lamports <= 0) {
    throw new Error("Amount too small");
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction({
    feePayer,
    blockhash,
    lastValidBlockHeight,
  });

  tx.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports,
    }),
  );

  return tx;
}
