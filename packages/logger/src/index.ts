export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = {
  requestId?: string | null;
  commandId?: string | null;
  orderId?: string | null;
  eventId?: string | null;
  market?: string | null;
  userId?: string | null;
  error?: unknown;
  [key: string]: unknown;
};

export type Logger = {
  log: (level: LogLevel, message: string, fields?: LogFields) => void;
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw = (
    process.env.LOG_LEVEL ??
    process.env.GATEWAY_LOG_LEVEL ??
    ""
  )
    .trim()
    .toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function normalizeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function sanitize(fields: LogFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = key === "error" ? normalizeError(value) : value;
  }
  return out;
}

/** Create a JSON logger bound to a service name. */
export function createLogger(service: string): Logger {
  const log = (
    level: LogLevel,
    message: string,
    fields: LogFields = {},
  ): void => {
    if (LEVEL_RANK[level] < LEVEL_RANK[configuredLevel()]) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...sanitize(fields),
    };

    const output = JSON.stringify(entry);
    if (level === "error") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);
  };

  return {
    log,
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}
