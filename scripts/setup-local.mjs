#!/usr/bin/env node
/**
 * Bootstrap local env files + apply Prisma migrations (non-interactive).
 * Never overwrites existing .env files.
 *
 * Usage (from repo root): pnpm setup:local
 * Prefer: pnpm infra:up  →  pnpm setup:local  →  pnpm dev:stack
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const example = path.join(root, ".env.example");

const targets = [
  path.join(root, ".env"),
  path.join(root, "packages", "db", ".env"),
  path.join(root, "apps", "web", ".env"),
];

function log(msg) {
  console.log(`[setup:local] ${msg}`);
}

function warn(msg) {
  console.warn(`[setup:local] WARN: ${msg}`);
}

function readEnvValue(filePath, key) {
  if (!existsSync(filePath)) return "";
  const text = readFileSync(filePath, "utf8");
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = text.match(re);
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

if (!existsSync(example)) {
  console.error(`[setup:local] missing ${example}`);
  process.exit(1);
}

for (const dest of targets) {
  mkdirSync(path.dirname(dest), { recursive: true });
  if (existsSync(dest)) {
    log(`keep existing ${path.relative(root, dest)}`);
  } else {
    copyFileSync(example, dest);
    log(`created ${path.relative(root, dest)}`);
  }
}

const dbEnv = path.join(root, "packages", "db", ".env");
const webEnv = path.join(root, "apps", "web", ".env");

log("prisma generate…");
let result = spawnSync(
  "pnpm",
  ["--filter", "@cex/db", "exec", "prisma", "generate"],
  { cwd: root, stdio: "inherit", shell: true },
);
if (result.status !== 0) process.exit(result.status ?? 1);

log("prisma migrate deploy…");
result = spawnSync(
  "pnpm",
  ["--filter", "@cex/db", "exec", "prisma", "migrate", "deploy"],
  { cwd: root, stdio: "inherit", shell: true, env: { ...process.env } },
);
if (result.status !== 0) {
  warn(
    "migrate deploy failed — is Postgres up? Run: pnpm infra:up && pnpm setup:local",
  );
  process.exit(result.status ?? 1);
}

const googleId =
  readEnvValue(webEnv, "GOOGLE_CLIENT_ID") ||
  readEnvValue(dbEnv, "GOOGLE_CLIENT_ID");
const nextAuthSecret =
  readEnvValue(webEnv, "NEXTAUTH_SECRET") ||
  readEnvValue(dbEnv, "NEXTAUTH_SECRET");

if (!googleId) {
  warn(
    "GOOGLE_CLIENT_ID is empty in apps/web/.env — fill Google OAuth to sign in.",
  );
}
if (!nextAuthSecret) {
  warn(
    "NEXTAUTH_SECRET is empty in apps/web/.env — set any random string for local sessions.",
  );
}

log("done. Next: pnpm dev:stack  (after pnpm infra:up)");
