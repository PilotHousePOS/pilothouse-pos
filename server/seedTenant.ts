/**
 * Seed script: creates the default "Animal House" tenant (id=1) and backfills
 * tenant_id = 1 on all existing rows in tenant-scoped tables.
 *
 * Run once after the initial db:push that adds tenantId columns.
 * Safe to run multiple times (idempotent).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  tenants,
  users,
  supplies,
  pets,
  orders,
  orderItems,
  cartItems,
  appointments,
  appointmentItems,
  customerPets,
  loyaltySettings,
  groomingSettings,
  groomers,
  groomerAvailability,
  groomerBlockedDays,
  boardingRecords,
  scheduleEntries,
  groomingScheduleEntries,
  contacts,
  refundReportSettings,
  weeklyAppointmentLimits,
  dailyAppointmentLimits,
  specialDateSettings,
  pushSubscriptions,
} from "@shared/schema";

async function seedTenant() {
  console.log("Starting tenant seed...");

  // 1. Upsert the default tenant (id=1, slug="animal-house")
  await db.execute(sql`
    INSERT INTO tenants (id, name, slug, subscription_status, subscription_tier)
    VALUES (1, 'Animal House', 'animal-house', 'active', 'pro')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug
  `);
  console.log("✓ Default tenant upserted (id=1, Animal House)");

  // Reset the tenants sequence so next auto-generated id doesn't collide with 1
  await db.execute(sql`
    SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1))
  `);

  // 2. Backfill tenant_id = 1 on all tables where it is NULL
  const tables = [
    { name: "users",                    table: users },
    { name: "supplies",                 table: supplies },
    { name: "pets",                     table: pets },
    { name: "orders",                   table: orders },
    { name: "order_items",              table: orderItems },
    { name: "cart_items",               table: cartItems },
    { name: "appointments",             table: appointments },
    { name: "appointment_items",        table: appointmentItems },
    { name: "customer_pets",            table: customerPets },
    { name: "loyalty_settings",         table: loyaltySettings },
    { name: "grooming_settings",        table: groomingSettings },
    { name: "groomers",                 table: groomers },
    { name: "groomer_availability",     table: groomerAvailability },
    { name: "groomer_blocked_days",     table: groomerBlockedDays },
    { name: "boarding_records",         table: boardingRecords },
    { name: "schedule_entries",         table: scheduleEntries },
    { name: "grooming_schedule_entries",table: groomingScheduleEntries },
    { name: "contacts",                 table: contacts },
    { name: "refund_report_settings",   table: refundReportSettings },
    { name: "weekly_appointment_limits",table: weeklyAppointmentLimits },
    { name: "daily_appointment_limits", table: dailyAppointmentLimits },
    { name: "special_date_settings",    table: specialDateSettings },
    { name: "push_subscriptions",       table: pushSubscriptions },
  ];

  for (const { name } of tables) {
    const result = await db.execute(
      sql.raw(`UPDATE "${name}" SET tenant_id = 1 WHERE tenant_id IS NULL`)
    );
    const rowsUpdated = (result as any).rowCount ?? 0;
    console.log(`✓ Backfilled ${rowsUpdated} rows in ${name}`);
  }

  console.log("\nTenant seed complete!");
}

// Run if executed directly
seedTenant()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
