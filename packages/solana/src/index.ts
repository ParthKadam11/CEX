import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Commitment,
  type TransactionSignature,
} from "@solana/web3.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Engine lot size for SOL-USD: 1 lot = 1 whole SOL. */
export const LAMPORTS_PER_LOT = LAMPORTS_PER_SOL;

export type ExplorerCluster = "devnet" | "testnet" | "mainnet-beta";

export type CreatedKeypair = {
  publicKey: string;
  /** Raw 64-byte secret key — encrypt before persistence. */
  secretKey: Uint8Array;
};

function rpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    "https://api.devnet.solana.com"
  );
}

export function getSolanaRpcUrl(): string {
  return rpcUrl();
}

export function explorerCluster(url = rpcUrl()): ExplorerCluster {
  if (url.includes("devnet")) return "devnet";
  if (url.includes("testnet")) return "testnet";
  return "mainnet-beta";
}

/** Fail closed if someone points the stack at mainnet. */
export function assertDevnetOnly(url = rpcUrl()): void {
  const cluster = explorerCluster(url);
  if (cluster === "mainnet-beta") {
    throw new Error(
      "SOLANA_MAINNET_FORBIDDEN: configure a Devnet (or Testnet) RPC URL",
    );
  }
  if (process.env.SOLANA_ALLOW_NON_DEVNET === "true") return;
  if (cluster !== "devnet") {
    throw new Error(
      `SOLANA_DEVNET_REQUIRED: got ${cluster}. Set SOLANA_ALLOW_NON_DEVNET=true to override.`,
    );
  }
}

/** Stable engine CREDIT commandId for a Devnet deposit signature. */
export function depositCreditCommandId(signature: string): string {
  return `deposit:${signature}`;
}

/** Engine DEBIT commandId for a withdrawal row. */
export function withdrawDebitCommandId(withdrawalId: string): string {
  return `withdraw:${withdrawalId}`;
}

/** Engine CREDIT commandId used to refund a failed on-chain send. */
export function withdrawRefundCommandId(withdrawalId: string): string {
  return `withdraw-refund:${withdrawalId}`;
}

/** Already finalized on-chain — retries must not send again. */
export function withdrawAlreadySent(
  status: string,
  signature: string | null | undefined,
): boolean {
  return (
    Boolean(signature) &&
    (status === "SENT" || status === "CONFIRMED")
  );
}

/** Debit landed but chain send not finished — resume send only. */
export function withdrawNeedsChainSend(status: string): boolean {
  return status === "DEBITED";
}

export function createConnection(
  commitment: Commitment = "confirmed",
): Connection {
  assertDevnetOnly();
  return new Connection(rpcUrl(), commitment);
}

/** @deprecated Prefer createConnection() so Devnet is enforced. */
export const connection = new Proxy({} as Connection, {
  get(_target, prop, receiver) {
    const live = createConnection();
    const value = Reflect.get(live, prop, receiver);
    return typeof value === "function" ? value.bind(live) : value;
  },
});

export function createKeypair(): CreatedKeypair {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey.slice(),
  };
}

export function keypairFromSecretKey(secretKey: Uint8Array): Keypair {
  return Keypair.fromSecretKey(secretKey);
}

/** Returns base58 pubkey or throws INVALID_PUBLIC_KEY. */
export function parsePublicKey(address: string): string {
  try {
    return new PublicKey(address.trim()).toBase58();
  } catch {
    throw new Error("INVALID_PUBLIC_KEY");
  }
}

export async function getLamportsBalance(address: string): Promise<number> {
  const conn = createConnection();
  return conn.getBalance(new PublicKey(address));
}

/** Whole SOL (float). Prefer getLamportsBalance + lamportsToLots for credits. */
export async function getSolBalance(address: string): Promise<number> {
  return (await getLamportsBalance(address)) / LAMPORTS_PER_SOL;
}

export function lamportsToLots(lamports: number): number {
  if (!Number.isFinite(lamports) || lamports < 0) return 0;
  return Math.floor(lamports / LAMPORTS_PER_LOT);
}

export function lotsToLamports(lots: number): number {
  if (!Number.isInteger(lots) || lots < 0) {
    throw new Error("INVALID_LOTS");
  }
  return lots * LAMPORTS_PER_LOT;
}

export async function sendSol(options: {
  fromSecretKey: Uint8Array;
  toAddress: string;
  lamports: number;
  commitment?: Commitment;
}): Promise<TransactionSignature> {
  if (!Number.isInteger(options.lamports) || options.lamports <= 0) {
    throw new Error("INVALID_LAMPORTS");
  }
  const conn = createConnection(options.commitment ?? "confirmed");
  const from = Keypair.fromSecretKey(options.fromSecretKey);
  const to = new PublicKey(options.toAddress);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: options.lamports,
    }),
  );
  return sendAndConfirmTransaction(conn, tx, [from], {
    commitment: options.commitment ?? "confirmed",
  });
}

export async function confirmSignature(
  signature: string,
  commitment: Commitment = "confirmed",
): Promise<{ ok: boolean; err: unknown }> {
  const conn = createConnection(commitment);
  const latest = await conn.getLatestBlockhash(commitment);
  const result = await conn.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    commitment,
  );
  return { ok: !result.value.err, err: result.value.err ?? null };
}

export function explorerTxUrl(
  signature: string,
  cluster: ExplorerCluster = explorerCluster(),
): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export function explorerAddressUrl(
  address: string,
  cluster: ExplorerCluster = explorerCluster(),
): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

export function faucetUrl(
  cluster: ExplorerCluster = explorerCluster(),
): string | null {
  if (cluster === "devnet") return "https://faucet.solana.com/";
  return null;
}

const ENC_PREFIX = "v1";

function masterKeyBytes(): Buffer {
  const raw = process.env.SOLANA_WALLET_MASTER_KEY?.trim();
  if (!raw) {
    throw new Error(
      "SOLANA_WALLET_MASTER_KEY is required to encrypt deposit wallet secrets",
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  throw new Error(
    "SOLANA_WALLET_MASTER_KEY must be 32 bytes as 64 hex chars or base64",
  );
}

/** AES-256-GCM. Format: v1:<iv_b64>:<tag_b64>:<ciphertext_b64> */
export function encryptSecretKey(secretKey: Uint8Array): string {
  const key = masterKeyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(secretKey)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENC_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecretKey(payload: string): Uint8Array {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== ENC_PREFIX) {
    throw new Error("INVALID_ENCRYPTED_SECRET");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = masterKeyBytes();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64!, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64!, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64url")),
    decipher.final(),
  ]);
  return new Uint8Array(plain);
}

export { LAMPORTS_PER_SOL };
