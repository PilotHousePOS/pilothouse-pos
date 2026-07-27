---
name: PilotHouse SaaS architectural decisions
description: Key multi-tenancy, security, and operational decisions made during the SaaS transformation
---

## Multi-tenancy architecture

**Rule:** Every DB table that stores business data has a `tenant_id INTEGER REFERENCES tenants(id)` column. All queries that touch business data must pass `tenantId` from `req.tenantId` (set by `tenantMiddleware`). Never use user-supplied body values for tenant scoping — always use `req.tenantId` (derived from JWT → DB lookup).

**Why:** Prevents cross-tenant data leaks. `resolveWriteTenantId()` in routes.ts is the canonical helper for write operations.

**How to apply:** When adding a new table, add it to `server/scripts/apply-missing-columns.ts` (ALTER TABLE) and `server/index.ts` (CREATE TABLE IF NOT EXISTS). The migration validator will catch missing columns at startup.

---

## Migration system

**Rule:** All new columns go in `server/scripts/apply-missing-columns.ts` ONLY. Never put `ALTER TABLE` statements elsewhere. At startup, after all columns are applied, a validation query checks `information_schema.columns` and logs a loud error for any missing column.

**Why:** Task #113 — columns added to the wrong file get silently skipped. The validator catches this immediately on next restart.

---

## Stripe alert guard (persisted)

**Rule:** The daily Stripe key failure alert guard is stored in `.cache/stripe-alert-guard.json` (not in memory). Use `readStripeAlertGuard()` / `writeStripeAlertGuard(date)` in `server/scheduler.ts`.

**Why:** In-memory guard resets on server restart, allowing duplicate alert emails on the same day.

---

## Dropped audit log warnings

**Rule:** When `withRetry(() => storage.createAuditLog(...))` exhausts all retries, the failure is logged to console.warn AND appended to `.cache/dropped-audit-warnings.jsonl` (JSONL format). File-based because the DB is what's failing.

**Why:** If the DB is down, writing to another DB table for the dropped warning would also fail.

---

## Stripe refresh endpoint

**Rule:** `POST /api/super-admin/stripe/refresh-credentials` now calls `getUncachableStripeClient()` after clearing the cache and returns `{ keyValid, validationError }`. The caller (admin UI) can show the result immediately without a separate health-check request.

---

## Unhide order endpoint

**Rule:** `POST /api/admin/orders/:id/unhide` (admin only, tenant-scoped) reverses `hideOrderFromAdmin`. The storage method `unhideOrderFromAdmin(id, tenantId)` uses `and(eq(orders.id, id), eq(orders.tenantId, tenantId))` so cross-tenant unhides 404.

---

## Audit log CSV export

**Rule:** `GET /api/super-admin/audit-log/csv` exports up to 10,000 rows as `text/csv`. Supports `?targetTenantId=` and `?actorUserId=` filters. Requires `requireSuperAdminMiddleware`.

---

## Supply filter DB-level scoping

**Rule:** `getSuppliesByFilter()` in storage.ts builds WHERE conditions at DB level (using drizzle `ilike`, `eq`, `and`) instead of fetching all rows and filtering in JS memory. This prevents cross-tenant leaks and is O(matched rows) not O(all rows).

---

## Trial banner / onboarding realtime updates

- `TrialBanner` has `staleTime: 30 * 1000` — disappears within 30s of subscription activating without user action.
- `TrialBanner` last-day clock ticks every minute via `setInterval` and calls `refetch()` when `msLeft <= 0`.
- Onboarding step is server-derived (not localStorage). BroadcastChannel + storage-event + visibilitychange fallbacks all call `queryClient.invalidateQueries`.

---

## Rate limiters

All limiters use `express-rate-limit` with in-memory store (per-process):
- `generalLimiter`: 200/15min on all `/api/*`; skips slugless `/auth/signup` to prevent stranded-request budget exhaustion.
- `authLimiter`: 15/15min on login, register, forgot-password, reset-password, change-password.
- `signupLimiter`: 15/15min on `/api/auth/signup`; skips requests with no `req.tenantId`.
- `checkoutLimiter`: 10/15min on `/api/orders` and `/api/create-payment-intent`.
- `searchLimiter`: 60/min on `/api/supplies/search` and `/api/pets` (shared pool — intentional).

---

## Per-tenant Stripe Connect & processor config

**Rule:** Each tenant connects their own Stripe account via OAuth (`STRIPE_CONNECT_CLIENT_ID` env var required). Storefront PaymentIntents inject `transfer_data: { destination: connectedAccountId }` when configured. Subscription billing is unaffected.

**Security invariants:**
- OAuth state is HMAC-SHA256 signed (SESSION_SECRET); callback rejects unsigned or expired states — prevents tenant-account hijacking.
- Stripe refresh tokens stored encrypted (AES-256-CBC, same key as processor API tokens).
- Connect routes registered AFTER `app.use('/api', tenantMiddleware)` so `req.tenantId` is always set.
- Processor config `GET` never returns the encrypted token (hardware layer gets address/name only).

**Why:** Tenants need revenue in their own bank. HMAC state prevents a rogue OAuth redirect from overwriting another tenant's connected account.

---

## Public route allowlist

Routes that must work without a tenant slug go in `UNAUTHENTICATED_NO_SLUG_ALLOWLIST` in `server/tenantMiddleware.ts`:
- `/auth/user`, `/settings/hiring-open`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/resend-verification`

**Why:** `tenantMiddleware` returns 400 "Missing tenant" for any unauthenticated `/api/*` request with no slug unless the path is in this list.
