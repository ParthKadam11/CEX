export type IngesterConfig = {
  port: number;
  redisUrl: string;
  timescaleUrl: string;
  internalToken: string;
  consumerName: string;
  batchSize: number;
  blockMs: number;
};

export function loadConfig(): IngesterConfig {
  return {
    port: boundedNumber(
      process.env.PORT ?? process.env.INGESTER_PORT ?? process.env.MARKET_DATA_PORT,
      4040,
      1_024,
      65_535,
    ),
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    timescaleUrl: resolveTimescaleUrl(),
    internalToken:
      process.env.INGESTER_INTERNAL_TOKEN ??
      process.env.MARKET_DATA_INTERNAL_TOKEN ??
      (process.env.NODE_ENV === "production"
        ? (() => {
            throw new Error(
              "INGESTER_INTERNAL_TOKEN is required in production",
            );
          })()
        : "local-dev-market-data-token"),
    consumerName:
      process.env.INGESTER_CONSUMER_NAME ??
      process.env.MARKET_DATA_CONSUMER_NAME ??
      `ingester-${process.pid}`,
    batchSize: boundedNumber(
      process.env.INGESTER_BATCH_SIZE ?? process.env.MARKET_DATA_BATCH_SIZE,
      100,
      1,
      1_000,
    ),
    blockMs: boundedNumber(
      process.env.INGESTER_BLOCK_MS ?? process.env.MARKET_DATA_BLOCK_MS,
      5_000,
      100,
      30_000,
    ),
  };
}

function resolveTimescaleUrl(): string {
  const raw = process.env.TIMESCALE_URL?.trim().replace(/^["']|["']$/g, "") ?? "";
  if (raw) return raw;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "TIMESCALE_URL is required in production (full postgresql://USER:PASSWORD@HOST/DB string)",
    );
  }
  return "postgresql://cex:cex@127.0.0.1:5434/cex_md";
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
