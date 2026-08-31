export type OmsConfig = {
  port: number;
  redisUrl: string;
  databaseUrl: string | null;
  consumerName: string;
  internalToken: string | null;
};

export function loadConfig(): OmsConfig {
  return {
    port: Number(process.env.OMS_PORT ?? 4030),
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    databaseUrl: process.env.DATABASE_URL ?? null,
    consumerName: process.env.OMS_CONSUMER_NAME ?? `oms-${process.pid}`,
    internalToken: serviceToken("OMS_INTERNAL_TOKEN", "local-dev-oms-token"),
  };
}

function serviceToken(name: string, fallback: string): string {
  const token = process.env[name];
  if (process.env.NODE_ENV === "production" && !token) {
    throw new Error(`${name} is required in production`);
  }
  return token ?? fallback;
}
