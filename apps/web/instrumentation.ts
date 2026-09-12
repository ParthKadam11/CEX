/**
 * Next.js Node bootstrap — optional MM heartbeat.
 * Never auto-starts. Set SIM_HEARTBEAT=true only if you explicitly want
 * process boot to start the sim (not recommended on Vercel).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (process.env.SIM_HEARTBEAT !== "true") return;

  try {
    const { startSimHeartbeat } = await import("@/lib/sim/market-maker");
    const { started } = startSimHeartbeat();
    if (started) {
      console.info("[sim] market-maker heartbeat started (SIM_HEARTBEAT=true)");
    }
  } catch (error) {
    console.error("[sim] heartbeat failed to start", error);
  }
}
