import path from "node:path";
import { accessSync, constants, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMarketSymbol, type MarketSymbol } from "@cex/exchange-types";
import { serve } from "@hono/node-server";
import { EventBus } from "./api/eventBus.js";
import { createExchangeApp } from "./api/server.js";
import { loadLocalEnv } from "./loadEnv.js";
import { log } from "./logger.js";
import { SharedWallet } from "./account/sharedWallet.js";
import { loadSnapshot, snapshotPathFor } from "./journal/snapshot.js";
import { MarketRuntime } from "./market/runtime.js";

/*
  Exchange process entrypoint.

  REST  → place / cancel / credit / queries / book / positions
  SSE   → /v1/markets/:market/stream  (ORDER, BBO, CREDIT, TRADE, POSITION)

  One process hosts one or more markets (default: spot + perps).
  Books / positions / WALs stay per market. Balances are one shared wallet.
*/

loadLocalEnv();

/** Always `apps/exchange`, even if the process was started from the monorepo root. */
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageDataDir = path.join(packageRoot, "data");

const markets = resolveMarkets();
const port = Number(process.env.PORT ?? process.env.EXCHANGE_PORT ?? 4010);
const gatewayToken = serviceToken(
  "EXCHANGE_GATEWAY_TOKEN",
  "local-dev-exchange-token",
);
const dataDir = resolveDataDir();
ensureDataDir(dataDir);

const bus = new EventBus();
const wallet = new SharedWallet(path.join(dataDir, "wallet.snapshot.json"));
seedWalletFromLegacySnapshots(wallet, markets, dataDir);
wallet.load();

const runtimes = new Map<MarketSymbol, MarketRuntime>();
for (const market of markets) {
  const walPath = resolveWalPath(market, markets.length);
  runtimes.set(
    market,
    MarketRuntime.open(market, walPath, bus, { wallet }),
  );
}

const app = createExchangeApp(runtimes, bus, {
  gatewayToken,
  dataDir,
  wallet,
});

const shutdown = () => {
  log.info("shutting down");
  void Promise.all([...runtimes.values()].map((rt) => rt.close())).finally(
    () => process.exit(0),
  );
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const listenHost = process.env.LISTEN_HOST?.trim() || "127.0.0.1";
serve({ fetch: app.fetch, port, hostname: listenHost }, (info) => {
  log.info("HTTP server listening", {
    host: listenHost,
    port: info.port,
    markets: [...runtimes.keys()],
    dataDir,
  });
});

/**
 * EXCHANGE_MARKETS=SOL-USD,SOL-USD-PERP (default)
 * EXCHANGE_MARKET=SOL-USD — single-market override (legacy / tests)
 */
function resolveMarkets(): MarketSymbol[] {
  const listed = process.env.EXCHANGE_MARKETS?.trim();
  if (listed) {
    const markets: MarketSymbol[] = [];
    for (const part of listed.split(",")) {
      const market = part.trim();
      if (!market) continue;
      if (!isMarketSymbol(market)) {
        throw new Error(`invalid EXCHANGE_MARKETS entry: ${market}`);
      }
      if (!markets.includes(market)) markets.push(market);
    }
    if (markets.length === 0) {
      throw new Error("EXCHANGE_MARKETS is empty");
    }
    return markets;
  }

  const single = process.env.EXCHANGE_MARKET?.trim();
  if (single) {
    if (!isMarketSymbol(single)) {
      throw new Error(`invalid EXCHANGE_MARKET: ${single}`);
    }
    return [single];
  }

  return ["SOL-USD", "SOL-USD-PERP"];
}

/**
 * WAL + snapshots live under this directory.
 *
 * Local / Render default: `<package>/data` (apps/exchange/data).
 * On Render mount a disk at that absolute path for durability:
 *   /opt/render/project/src/apps/exchange/data
 */
function resolveDataDir(): string {
  const configured = process.env.EXCHANGE_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);

  if (process.env.NODE_ENV === "production") {
    // Prefer the package data dir so a Render disk can mount over it.
    // Require an explicit opt-in so silent ephemeral prod data is obvious.
    if (process.env.EXCHANGE_ALLOW_EPHEMERAL_DATA === "true") {
      log.warn(
        "EXCHANGE_DATA_DIR unset; using package data dir (ephemeral unless a disk is mounted there)",
        { dataDir: packageDataDir },
      );
      return packageDataDir;
    }
    throw new Error(
      "EXCHANGE_DATA_DIR is required in production. " +
        "On Render set it to /opt/render/project/src/apps/exchange/data and mount a disk at that path, " +
        "or set EXCHANGE_ALLOW_EPHEMERAL_DATA=true to boot without a disk (data lost on redeploy).",
    );
  }

  return packageDataDir;
}

function ensureDataDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    throw new Error(
      `EXCHANGE_DATA_DIR=${dir} is not writable (${code || "error"}). ` +
        `On Render: Disks → Add disk, Mount Path must be exactly this path (paid plan required). ` +
        `Quick boot without a disk: set EXCHANGE_DATA_DIR=/opt/render/project/src/apps/exchange/data ` +
        `(writable, but wiped on redeploy until you mount a disk there).`,
      { cause: error },
    );
  }
}

function resolveWalPath(market: MarketSymbol, marketCount: number): string {
  const single =
    marketCount === 1 ? process.env.EXCHANGE_WAL_PATH?.trim() : undefined;
  if (single) return path.resolve(single);
  return path.join(dataDir, `${market}.jsonl`);
}

/**
 * First boot after shared-wallet upgrade: if wallet.snapshot.json is missing,
 * seed from the richest legacy per-market snapshot (prefer SOL-USD) so paper
 * balances are not wiped.
 */
function seedWalletFromLegacySnapshots(
  wallet: SharedWallet,
  markets: readonly MarketSymbol[],
  dir: string,
): void {
  const walletPath = path.join(dir, "wallet.snapshot.json");
  try {
    accessSync(walletPath, constants.R_OK);
    return;
  } catch {
    // missing — seed below
  }

  const preferred = markets.includes("SOL-USD")
    ? ["SOL-USD", ...markets.filter((m) => m !== "SOL-USD")]
    : [...markets];

  for (const market of preferred) {
    const snap = loadSnapshot(
      snapshotPathFor(path.join(dir, `${market}.jsonl`)),
    );
    if (!snap || snap.balances.length === 0) continue;
    wallet.money.balances.loadAll(snap.balances);
    wallet.money.ledger.replace(snap.ledger ?? [], snap.ledgerSeq ?? 0);
    wallet.save();
    log.info("seeded shared wallet from legacy market snapshot", {
      market,
      balances: snap.balances.length,
    });
    return;
  }
}

function serviceToken(name: string, fallback: string): string {
  const token = process.env[name];
  if (process.env.NODE_ENV === "production" && !token) {
    throw new Error(`${name} is required in production`);
  }
  return token ?? fallback;
}
