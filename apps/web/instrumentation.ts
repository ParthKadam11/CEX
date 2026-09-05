/**
 * Next.js Node bootstrap — start low-load MM heartbeat so the book
 * looks alive without a browser tab driving ticks.
 *
 * Disable with SIM_HEARTBEAT=false.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.SIM_HEARTBEAT === "false") return;

  const { startSimHeartbeat } = await import("@/lib/sim/market-maker");
  const { started } = startSimHeartbeat();
  if (started) {
    console.info("[sim] market-maker heartbeat started");
  }
}
