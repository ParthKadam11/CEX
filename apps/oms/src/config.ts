export type OmsConfig = {
  port: number;
  redisUrl: string;
  databaseUrl: string | null;
};

export function loadConfig(): OmsConfig {
  return {
    port: Number(process.env.OMS_PORT ?? 4030),
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    databaseUrl: process.env.DATABASE_URL ?? null,
  };
}
