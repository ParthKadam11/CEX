/** Sim traffic older than this is dropped instead of applied in a catch-up burst. */
export const STALE_SIM_COMMAND_MS = 1_500;

export function isSimUser(userId: string): boolean {
  return userId.startsWith("sim-");
}

/** Redis stream ids are `<milliseconds>-<seq>`. */
export function streamIdTimeMs(id: string): number | null {
  const head = id.split("-")[0] ?? "";
  if (!/^\d+$/.test(head)) return null;
  const ms = Number(head);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Paper-sim commands that have been sitting in the mailbox. Real user
 * commands are never stale: they still run even if the pipe was backed up.
 */
export function isStaleSimCommand(
  messageId: string,
  userId: string,
  now = Date.now(),
): boolean {
  if (!isSimUser(userId)) return false;
  const enqueuedAt = streamIdTimeMs(messageId);
  if (enqueuedAt == null) return false;
  return now - enqueuedAt > STALE_SIM_COMMAND_MS;
}
