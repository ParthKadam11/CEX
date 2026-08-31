import Redis from "ioredis";

export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (attempt) =>
      attempt > 5 ? null : Math.min(attempt * 200, 2_000),
  });
}
