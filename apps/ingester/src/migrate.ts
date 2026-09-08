import { createPool, runMigrations } from "./db.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.timescaleUrl);
  try {
    await runMigrations(pool);
    console.log("[ingester] TimescaleDB schema is ready");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    "[ingester] migration failed",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
