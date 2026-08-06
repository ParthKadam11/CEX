import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PublicKey } from "@solana/web3.js";
import { connection } from "@cex/solana";
import db from "@cex/db";
import { authOptions } from "@/lib/auth";
import { keypairFromStoredSecret } from "@/lib/solana-keypair";
import { buildSolTransfer } from "@/lib/transfers";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.uid;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { amount?: number; destination?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = body.amount;
  const destination = body.destination?.trim();

  if (typeof amount !== "number" || !destination) {
    return NextResponse.json(
      { error: "amount and destination are required" },
      { status: 400 },
    );
  }

  let destinationKey: PublicKey;
  try {
    destinationKey = new PublicKey(destination);
  } catch {
    return NextResponse.json(
      { error: "Invalid destination address" },
      { status: 400 },
    );
  }

  const wallet = await db.solWallet.findUnique({
    where: { userId },
    select: { publicKey: true, privateKey: true },
  });

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  try {
    const fromKeypair = keypairFromStoredSecret(wallet.privateKey);

    if (fromKeypair.publicKey.toBase58() !== wallet.publicKey) {
      return NextResponse.json(
        { error: "Wallet key mismatch" },
        { status: 500 },
      );
    }

    if (destinationKey.equals(fromKeypair.publicKey)) {
      return NextResponse.json(
        { error: "Destination cannot be your CEX deposit address" },
        { status: 400 },
      );
    }

    const tx = await buildSolTransfer({
      connection,
      amount,
      from: fromKeypair.publicKey,
      to: destinationKey,
      feePayer: fromKeypair.publicKey,
    });

    tx.sign(fromKeypair);
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });
    await connection.confirmTransaction(signature, "confirmed");

    return NextResponse.json({ signature });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Withdraw failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
