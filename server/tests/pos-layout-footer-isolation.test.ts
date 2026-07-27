/**
 * Tests: PUT /api/admin/pos/layout must not overwrite pos_receipt_footer
 *
 * The receipt footer is stored under a separate "pos_receipt_footer" key in
 * grooming_settings.  The PUT /api/admin/pos/layout handler is explicitly
 * forbidden from touching that key — even if the two settings are later
 * refactored into a single JSON blob.
 *
 * This test saves a receipt footer, then PUTs a new pos_layout, and asserts
 * that the footer value is unchanged both via the HTTP endpoint and directly
 * in the database.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import supertest from "supertest";
import { db } from "../db";
import { tenants, users, groomingSettings } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { generateToken } from "../auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 9);
}

async function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);
  return app;
}

async function getDbUser(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

// ─── Shared state ─────────────────────────────────────────────────────────────

let agent: ReturnType<typeof supertest>;
let tenantId: number;
let tenantSlug: string;
let adminUserId: string;
let token: string;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const sfx = randomSuffix();

  await db.execute(
    sql`SELECT setval(
          pg_get_serial_sequence('tenants', 'id'),
          GREATEST((SELECT MAX(id) FROM tenants), 1)
        )`,
  );

  tenantSlug = `pos-footer-${sfx}`;
  const result = await db.execute(
    sql`INSERT INTO tenants (name, slug, subscription_status, subscription_tier)
        VALUES (${"POS-Footer-Test-" + sfx}, ${tenantSlug}, 'active', 'pro')
        RETURNING id`,
  );
  tenantId = (result.rows[0] as { id: number }).id;

  adminUserId = `pos-footer-${sfx}`;
  const [user] = await db
    .insert(users)
    .values({
      id: adminUserId,
      email: `pos-footer-${sfx}@test.local`,
      firstName: "POS",
      lastName: "Footer",
      tenantId,
      password: "hashed-password-for-test",
      isAdmin: true,
      tokenVersion: 0,
    })
    .returning();

  const dbUser = await getDbUser(user.id);
  token = generateToken(dbUser as any);

  const app = await buildTestApp();
  agent = supertest(app);
}, 60_000);

afterAll(async () => {
  // Remove grooming_settings rows created during the test
  if (tenantId) {
    await db
      .delete(groomingSettings)
      .where(eq(groomingSettings.tenantId, tenantId))
      .catch(() => {});
  }
  if (adminUserId) {
    await db.delete(users).where(eq(users.id, adminUserId)).catch(() => {});
  }
  if (tenantId) {
    await db.delete(tenants).where(eq(tenants.id, tenantId)).catch(() => {});
  }
}, 30_000);

// ─── PUT /api/admin/pos/layout must not overwrite pos_receipt_footer ──────────

describe("PUT /api/admin/pos/layout — receipt footer isolation", () => {
  const FOOTER_TEXT = "Thank you for visiting! 🐾";

  const LAYOUT_PAYLOAD = {
    categories: [
      {
        id: "bath",
        label: "Bath",
        services: [{ id: "bath-basic", label: "Basic Bath", price: 25 }],
      },
    ],
  };

  it("saves the receipt footer successfully via PUT /api/admin/pos/receipt-footer", async () => {
    const res = await agent
      .put("/api/admin/pos/receipt-footer")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Slug", tenantSlug)
      .send({ footerMessage: FOOTER_TEXT });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
  });

  it("GET /api/admin/pos/receipt-footer returns the saved footer before layout update", async () => {
    const res = await agent
      .get("/api/admin/pos/receipt-footer")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Slug", tenantSlug);

    expect(res.status).toBe(200);
    expect(res.body.footerMessage).toBe(FOOTER_TEXT);
  });

  it("PUT /api/admin/pos/layout succeeds with a valid layout payload", async () => {
    const res = await agent
      .put("/api/admin/pos/layout")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Slug", tenantSlug)
      .send(LAYOUT_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
  });

  it("GET /api/admin/pos/receipt-footer still returns the original footer after the layout PUT", async () => {
    const res = await agent
      .get("/api/admin/pos/receipt-footer")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Slug", tenantSlug);

    expect(res.status).toBe(200);
    expect(res.body.footerMessage).toBe(FOOTER_TEXT);
  });

  it("pos_receipt_footer row in the database is unchanged after the layout PUT", async () => {
    const [row] = await db
      .select({ value: groomingSettings.value })
      .from(groomingSettings)
      .where(
        and(
          eq(groomingSettings.tenantId, tenantId),
          eq(groomingSettings.setting, "pos_receipt_footer"),
        ),
      );

    expect(row).toBeDefined();
    expect(row?.value).toBe(FOOTER_TEXT);
  });

  it("pos_layout row in the database reflects the newly saved layout", async () => {
    const [row] = await db
      .select({ value: groomingSettings.value })
      .from(groomingSettings)
      .where(
        and(
          eq(groomingSettings.tenantId, tenantId),
          eq(groomingSettings.setting, "pos_layout"),
        ),
      );

    expect(row).toBeDefined();
    const parsed = JSON.parse(row!.value);
    expect(Array.isArray(parsed.categories)).toBe(true);
    expect(parsed.categories[0].id).toBe("bath");
  });
});
