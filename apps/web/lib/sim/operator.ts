/**
 * Who may drive the shared sim (start/stop, quotes, wipe).
 * SIM_OPERATOR_EMAILS is a comma-separated list of Google emails.
 * In production an empty list means nobody. Locally an empty list still allows it.
 */

export function simOperatorEmails(): Set<string> {
  const raw = process.env.SIM_OPERATOR_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export function isSimOperator(email: string | null | undefined): boolean {
  const allow = simOperatorEmails();
  if (allow.size === 0) return process.env.NODE_ENV !== "production";
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized.length > 0 && allow.has(normalized);
}
