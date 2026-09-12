/**
 * Next.js Node bootstrap — optional low-load MM heartbeat.
 *
 * Always off on Vercel unless SIM_HEARTBEAT=true (serverless is a bad fit).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.VERCEL === "1" && process.env.SIM_HEARTBEAT !== "true") {
    return;
  }
  if (process.env.SIM_HEARTBEAT === "false") return;

  try {
    const { startSimHeartbeat } = await import("@/lib/sim/market-maker");
    const { started } = startSimHeartbeat();
    if (started) {
      console.info("[sim] market-maker heartbeat started");
    }
  } catch (error) {
    console.error("[sim] heartbeat failed to start", error);
  }
}
