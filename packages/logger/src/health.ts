export type RedisHealthClient = {
  ping(): Promise<string>;
  xinfo(section: string, key: string): Promise<unknown>;
};

export type DependencyCheck = {
  ok: boolean;
  detail?: string;
  lag?: number | null;
  pending?: number | null;
};

export type StreamGroupCheck = DependencyCheck & {
  stream: string;
  group: string;
  exists: boolean;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function maxCommandLag(): number {
  return envInt("HEALTH_MAX_COMMAND_LAG", 10_000);
}

export function maxEventLag(): number {
  return envInt("HEALTH_MAX_EVENT_LAG", 5_000);
}

export function maxMdLag(): number {
  return envInt("HEALTH_MAX_MD_LAG", 10_000);
}

export async function pingRedis(
  redis: RedisHealthClient,
): Promise<DependencyCheck> {
  try {
    const pong = await redis.ping();
    return pong === "PONG"
      ? { ok: true }
      : { ok: false, detail: `unexpected ping reply: ${String(pong)}` };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Parse Redis XINFO GROUPS reply (array-of-arrays or array-of-objects). */
export function parseXInfoGroups(raw: unknown): Array<{
  name: string;
  pending: number;
  lag: number | null;
}> {
  if (!Array.isArray(raw)) return [];
  const groups: Array<{ name: string; pending: number; lag: number | null }> =
    [];

  for (const entry of raw) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const row = entry as Record<string, unknown>;
      const name = String(row.name ?? "");
      if (!name) continue;
      groups.push({
        name,
        pending: Number(row.pending ?? 0) || 0,
        lag:
          row.lag === undefined || row.lag === null
            ? null
            : Number(row.lag) || 0,
      });
      continue;
    }
    if (!Array.isArray(entry)) continue;
    const map = new Map<string, unknown>();
    for (let i = 0; i + 1 < entry.length; i += 2) {
      map.set(String(entry[i]), entry[i + 1]);
    }
    const name = String(map.get("name") ?? "");
    if (!name) continue;
    const lagRaw = map.get("lag");
    groups.push({
      name,
      pending: Number(map.get("pending") ?? 0) || 0,
      lag: lagRaw === undefined || lagRaw === null ? null : Number(lagRaw) || 0,
    });
  }
  return groups;
}

export async function checkConsumerGroup(
  redis: RedisHealthClient,
  stream: string,
  group: string,
  maxLag: number,
): Promise<StreamGroupCheck> {
  try {
    const raw = await redis.xinfo("GROUPS", stream);
    const groups = parseXInfoGroups(raw);
    const row = groups.find((g) => g.name === group);
    if (!row) {
      return {
        ok: false,
        stream,
        group,
        exists: false,
        lag: null,
        pending: null,
        detail: "GROUP_MISSING",
      };
    }
    const lag = row.lag ?? 0;
    const pending = row.pending;
    const lagOk = lag <= maxLag;
    return {
      ok: lagOk,
      stream,
      group,
      exists: true,
      lag,
      pending,
      ...(lagOk ? {} : { detail: "LAG_HIGH" }),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      stream,
      group,
      exists: false,
      lag: null,
      pending: null,
      detail,
    };
  }
}
