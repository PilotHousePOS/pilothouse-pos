/**
 * Applies missing tenant_id and related columns that exist in the Drizzle
 * schema but may not yet be present in the database.
 * Safe to run multiple times — uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
 *
 * Connection errors are retried once (with a 3-second delay) before the error
 * is re-thrown so that callers can treat an unreachable database as fatal
 * rather than silently skipping the migration.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

const STATEMENTS = [
  // tenants table
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_warning_email_sent_at TIMESTAMPTZ`,
  // pets table
  `ALTER TABLE pets ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // groomers table
  `ALTER TABLE groomers ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // supplies — tenant_id (confirm exists)
  `ALTER TABLE supplies ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // contacts — tenant_id (confirm exists)
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // appointments — tenant_id (confirm exists)
  `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // orders — tenant_id (confirm exists)
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // order_items — tenant_id
  `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
];

/**
 * Returns true when the error looks like a transient database connectivity
 * problem (TCP refused, timeout, DNS failure, dropped connection, etc.).
 */
function isConnectionError(err: any): boolean {
  // PostgreSQL SQLSTATE class 08 = Connection Exception; 57P0x = crash/shutdown
  const pgConnectionCodes = [
    "08000", "08001", "08003", "08004", "08006", "08P01",
    "57P01", "57P02", "57P03",
  ];
  if (err?.code && pgConnectionCodes.includes(String(err.code))) return true;

  // Node.js / OS network errors
  const nodeNetworkCodes = [
    "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "EPIPE",
  ];
  if (err?.code && nodeNetworkCodes.includes(String(err.code))) return true;

  // Message-based fallback (covers driver-level messages)
  const msg = (err?.message ?? "").toLowerCase();
  return (
    msg.includes("connect econnrefused") ||
    msg.includes("connection refused") ||
    msg.includes("etimedout") ||
    msg.includes("enotfound") ||
    msg.includes("econnreset") ||
    msg.includes("connection terminated") ||
    msg.includes("terminating connection")
  );
}

/**
 * Executes every ALTER TABLE statement once.  Per-statement errors that are
 * NOT connectivity problems (e.g. an unexpected schema conflict) are logged
 * and skipped so the remaining statements still run.  Connectivity errors are
 * re-thrown immediately so the caller's retry/fatal logic can handle them.
 */
async function runStatements(): Promise<void> {
  for (const stmt of STATEMENTS) {
    console.log(`[migration] ${stmt}`);
    try {
      await db.execute(sql.raw(stmt));
      console.log("  ✓ OK");
    } catch (err: any) {
      if (isConnectionError(err)) {
        // Propagate so the retry wrapper (or the caller) sees it.
        throw err;
      }
      console.error("  ✗ FAILED:", err.message);
    }
  }
}

/**
 * Exported function so callers (server startup, test global setup) can await
 * the migration without spawning a subprocess.
 *
 * On a connectivity error the function waits 3 seconds and retries once.
 * If the retry also fails the error is re-thrown so the caller (runAppMigrations)
 * treats the missing migration as fatal and operators see a clear message.
 */
export async function applyMissingColumns(): Promise<void> {
  try {
    await runStatements();
  } catch (err: any) {
    if (isConnectionError(err)) {
      console.warn(
        `[migration] Database connection error — retrying in 3 s: ${err.message}`
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
      // Second attempt — let any error propagate to the caller.
      await runStatements();
    } else {
      throw err;
    }
  }
  console.log("[migration] Done.");
}

// Allow direct execution: tsx server/scripts/apply-missing-columns.ts
if (process.argv[1] && process.argv[1].endsWith("apply-missing-columns.ts")) {
  applyMissingColumns()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
