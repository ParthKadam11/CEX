import { createPool, runMigrations } from "./db.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.timescaleUrl);
  try {
    await runMigrations(pool);
    console.log("[market-data-writer] TimescaleDB schema is ready");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    "[market-data-writer] migration failed",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
