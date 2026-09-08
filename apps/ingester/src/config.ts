export type MarketDataWriterConfig = {
  port: number;
  redisUrl: string;
  timescaleUrl: string;
  internalToken: string;
  consumerName: string;
  batchSize: number;
  blockMs: number;
};

export function loadConfig(): MarketDataWriterConfig {
  return {
    port: boundedNumber(process.env.MARKET_DATA_PORT, 4040, 1_024, 65_535),
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    timescaleUrl:
      process.env.TIMESCALE_URL ??
      "postgresql://cex:cex@127.0.0.1:5434/cex_md",
    internalToken: serviceToken(
      "MARKET_DATA_INTERNAL_TOKEN",
      "local-dev-market-data-token",
    ),
    consumerName:
      process.env.MARKET_DATA_CONSUMER_NAME ??
      `timescale-writer-${process.pid}`,
    batchSize: boundedNumber(
      process.env.MARKET_DATA_BATCH_SIZE,
      100,
      1,
      1_000,
    ),
    blockMs: boundedNumber(
      process.env.MARKET_DATA_BLOCK_MS,
      5_000,
      100,
      30_000,
    ),
  };
}

function serviceToken(name: string, fallback: string): string {
  const token = process.env[name];
  if (process.env.NODE_ENV === "production" && !token) {
    throw new Error(`${name} is required in production`);
  }
  return token ?? fallback;
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
