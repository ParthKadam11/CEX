type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? process.env.GATEWAY_LOG_LEVEL ?? "info")
    .trim()
    .toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

export function log(
  level: LogLevel,
  message: string,
  fields: LogFields = {},
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[configuredLevel()]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "engine-gateway",
    message,
    ...fields,
  };

  const output = JSON.stringify(entry);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}
