import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

/**
 * Load local env files without overriding already-set process.env.
 * Tries cwd, repo root, and packages/db (DATABASE_URL).
 */
export function loadLocalEnv(): void {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, ".env"),
    path.resolve(cwd, "../../.env"),
    path.resolve(cwd, "../.env"),
    path.resolve(cwd, "../../packages/db/.env"),
    path.resolve(cwd, "packages/db/.env"),
    path.resolve(cwd, "../db/.env"),
  ];
  const seen = new Set<string>();
  for (const envPath of candidates) {
    if (seen.has(envPath) || !existsSync(envPath)) continue;
    seen.add(envPath);
    loadDotenv({ path: envPath, override: false });
  }
}
