/**
 * Canonical list of idempotent ALTER TABLE migrations shared by both the
 * server startup path (runAppMigrations → applyMissingColumns) and the
 * standalone script (tsx server/scripts/apply-missing-columns.ts).
 *
 * Add every new column here — do NOT add ALTER TABLE statements elsewhere.
 * Safe to run multiple times — uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
 *
 * Connection errors are retried once (with a 3-second delay) before the error
 * is re-thrown so that callers can treat an unreachable database as fatal
 * rather than silently skipping the migration.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

const STATEMENTS = [
  // ── users ──────────────────────────────────────────────────────────────────
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_charge_account BOOLEAN DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_groomer BOOLEAN DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superior_manager BOOLEAN DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS total_spent NUMERIC(10,2) DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_credits NUMERIC(10,2) DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_default_payment_method VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT false`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_emails_opt_in BOOLEAN DEFAULT true`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS appointment_emails_opt_in BOOLEAN DEFAULT true`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS abandoned_cart_email_sent_at TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(100)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS stranded_alert_sent_at TIMESTAMP`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // ── orders ─────────────────────────────────────────────────────────────────
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notes TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // ── tenants ────────────────────────────────────────────────────────────────
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_warning_email_sent_at TIMESTAMPTZ`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_owner_missing_alert_sent_at TIMESTAMPTZ`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0`,
  // ── pets ───────────────────────────────────────────────────────────────────
  `ALTER TABLE pets ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // ── groomers ───────────────────────────────────────────────────────────────
  `ALTER TABLE groomers ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // ── supplies ───────────────────────────────────────────────────────────────
  `ALTER TABLE supplies ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  `ALTER TABLE supplies ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 1`,
  // ── contacts ───────────────────────────────────────────────────────────────
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // ── appointments ───────────────────────────────────────────────────────────
  `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // ── order_items ────────────────────────────────────────────────────────────
  `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // ── pos_zero_stock_tracker ─────────────────────────────────────────────────
  `ALTER TABLE pos_zero_stock_tracker ADD COLUMN IF NOT EXISTS threshold INTEGER DEFAULT 16`,
  // ── pos_orders ─────────────────────────────────────────────────────────────
  `ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER`,
  // ── appointment_history ────────────────────────────────────────────────────
  `ALTER TABLE appointment_history ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
  // ── job_applications ───────────────────────────────────────────────────────
  `ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`,
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
