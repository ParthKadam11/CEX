import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Use process.env (not env()) so `prisma generate` works during
 * `pnpm install` on hosts that have no DATABASE_URL (e.g. Render exchange).
 * migrate/deploy still require DATABASE_URL at runtime.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
