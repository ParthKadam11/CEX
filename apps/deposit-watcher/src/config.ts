import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

export type WatcherConfig = {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  pollIntervalMs: number;
  confirmations: "confirmed" | "finalized";
  minLots: number;
  gatewayInternalToken: string;
  engineGatewayUrl: string;
};

export function loadEnvironment(): void {
  const paths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../packages/db/.env"),
    path.resolve(process.cwd(), "packages/db/.env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  for (const envPath of paths) {
    if (existsSync(envPath)) loadDotenv({ path: envPath });
  }
}

export function loadConfig(): WatcherConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const confirmations =
    process.env.DEPOSIT_COMMITMENT === "finalized" ? "finalized" : "confirmed";

  return {
    port: Number(process.env.DEPOSIT_WATCHER_PORT ?? 4050),
    databaseUrl,
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    pollIntervalMs: Number(process.env.DEPOSIT_POLL_MS ?? 5_000),
    confirmations,
    minLots: Math.max(1, Number(process.env.DEPOSIT_MIN_LOTS ?? 1)),
    gatewayInternalToken:
      process.env.ENGINE_GATEWAY_INTERNAL_TOKEN ?? "local-dev-gateway-token",
    engineGatewayUrl: (
      process.env.ENGINE_GATEWAY_URL ?? "http://127.0.0.1:4020"
    ).replace(/\/$/, ""),
  };
}
