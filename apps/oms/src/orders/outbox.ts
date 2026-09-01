import type { AppCommand } from "@cex/app-contracts";

export function isOutboxCommand(value: unknown): value is AppCommand {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "PLACE" || type === "CANCEL" || type === "CREDIT";
}
