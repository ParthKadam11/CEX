import { createPool, runMigrations } from "./db.js";
import { loadConfig } from "./config.js";
import { log } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.timescaleUrl);
  try {
    await runMigrations(pool);
    log.info("TimescaleDB schema is ready");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  log.error("migration failed", { error });
  process.exitCode = 1;
});
