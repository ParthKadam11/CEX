/**
 * Next.js Node bootstrap — optional low-load MM heartbeat.
 *
 * Off by default on Vercel (serverless): set SIM_HEARTBEAT=true to enable.
 * Locally defaults on unless SIM_HEARTBEAT=false.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const onVercel = process.env.VERCEL === "1";
  const flag = process.env.SIM_HEARTBEAT;
  const enabled =
    flag === "true" ? true : flag === "false" ? false : !onVercel;
  if (!enabled) return;

  const { startSimHeartbeat } = await import("@/lib/sim/market-maker");
  const { started } = startSimHeartbeat();
  if (started) {
    console.info("[sim] market-maker heartbeat started");
  }
}
