type LogFields = Record<string, unknown>;

export function log(
  level: "info" | "warn" | "error",
  message: string,
  fields: LogFields = {},
): void {
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
