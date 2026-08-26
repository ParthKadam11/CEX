export type GatewayConfig = {
  port: number;
  exchangeUrl: string;
  redisUrl: string;
  market: "SOL-USD";
};

export function loadConfig(): GatewayConfig {
  const port = Number(process.env.GATEWAY_PORT ?? 4020);
  const exchangeUrl = (
    process.env.EXCHANGE_URL ?? "http://127.0.0.1:4010"
  ).replace(/\/$/, "");
  const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

  return {
    port,
    exchangeUrl,
    redisUrl,
    market: "SOL-USD",
  };
}
