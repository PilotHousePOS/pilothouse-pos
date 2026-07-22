#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
npm install --prefer-offline 2>&1 | tail -5

echo "[post-merge] Running database migrations..."
# Use direct SQL to add any new tenant_id columns non-interactively,
# then let drizzle push handle remaining structural changes with --force.
# drizzle-kit push prompts interactively for rename-vs-create decisions;
# we always want "create column" so we pipe a no-op and use --force.
node --input-type=module << 'JSEOF'
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Ensure tenants table exists (drizzle will create it if not)
// Add tenant_id to all business-data tables that need it
const tables = [
  'loyalty_settings', 'pets', 'supplies', 'cart_items', 'orders',
  'order_items', 'refund_report_settings', 'appointments', 'appointment_items',
  'customer_pets', 'grooming_settings', 'weekly_appointment_limits',
  'daily_appointment_limits', 'special_date_settings', 'groomers',
  'groomer_availability', 'groomer_blocked_days', 'contacts',
  'push_subscriptions', 'boarding_records', 'schedule_entries',
  'users', 'appointment_history', 'pos_orders',
];

for (const table of tables) {
  try {
    const exists = await pool.query(
      `SELECT to_regclass('public."${table}"') as t`
    );
    if (!exists.rows[0].t) continue;
    await pool.query(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)`
    );
    await pool.query(`UPDATE "${table}" SET tenant_id = 1 WHERE tenant_id IS NULL`);
  } catch (err) {
    console.error('Migration warning for ' + table + ':', err.message);
  }
}

await pool.end();
JSEOF

echo "[post-merge] Done."
