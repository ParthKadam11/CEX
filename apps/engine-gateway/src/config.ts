export type GatewayConfig = {
  port: number;
  exchangeUrl: string;
  redisUrl: string;
  market: "SOL-USD";
  /** Redis Streams consumer name within the gateway group. */
  consumerName: string;
  internalToken: string | null;
};

export function loadConfig(): GatewayConfig {
  const port = Number(process.env.GATEWAY_PORT ?? 4020);
  const exchangeUrl = (
    process.env.EXCHANGE_URL ?? "http://127.0.0.1:4010"
  ).replace(/\/$/, "");
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  const consumerName =
    process.env.GATEWAY_CONSUMER_NAME ?? `engine-gw-${process.pid}`;

  return {
    port,
    exchangeUrl,
    redisUrl,
    market: "SOL-USD",
    consumerName,
    internalToken: process.env.GATEWAY_INTERNAL_TOKEN ?? null,
  };
}
