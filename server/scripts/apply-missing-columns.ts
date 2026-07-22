/**
 * Applies missing tenant_id and related columns that exist in the Drizzle
 * schema but may not yet be present in the database.
 * Safe to run multiple times — uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const statements = [
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

  for (const stmt of statements) {
    console.log(`Executing: ${stmt}`);
    try {
      await db.execute(sql.raw(stmt));
      console.log("  ✓ OK");
    } catch (err: any) {
      console.error("  ✗ FAILED:", err.message);
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
