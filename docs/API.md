# API Reference

## Tenant Resolution — Required Header

### `X-Tenant-Slug`

All API endpoints that are scoped to a store require a tenant context.  The
server resolves the tenant in the following priority order:

1. **Authenticated session** — if the request carries a valid JWT (cookie or
   `Authorization: Bearer <token>` header) the server looks up the user's
   assigned tenant automatically.  No additional header is needed for normal
   in-app requests.
2. **`X-Tenant-Slug` header** — a lowercase slug that uniquely identifies the
   store (e.g. `paws-and-claws`).  Required for unauthenticated requests and
   useful as a defensive guard on authenticated ones.
3. **`?tenant=<slug>` query parameter** — functionally equivalent to the header;
   use the header in preference.

If none of the above resolves to a known tenant the server responds with:

| Scenario | Status | Body |
|---|---|---|
| No slug provided at all | `400` | `{ "message": "Missing tenant: include an X-Tenant-Slug header or ?tenant= query parameter." }` |
| Slug provided but not found | `404` | `{ "message": "Store '<slug>' not found." }` |

### Endpoints exempt from tenant resolution

The following public endpoints do **not** require `X-Tenant-Slug`:

| Path | Notes |
|---|---|
| `POST /api/auth/login` | Platform-level login |
| `POST /api/auth/logout` | — |
| `POST /api/auth/forgot-password` | — |
| `POST /api/auth/reset-password` | — |
| `GET  /api/auth/verify-email` | Email link; no slug context available |
| `POST /api/auth/resend-verification` | — |
| `POST /api/tenants/signup` | Tenant onboarding; no tenant exists yet |
| `GET  /api/tenants/slug-check` | Pre-signup availability check |

> **Note:** `POST /api/auth/signup` (customer account creation) is **not** on
> the exempt list — it must include `X-Tenant-Slug` so the new account is
> linked to the correct store.

---

## Client Integration

### Frontend (React / fetch)

The built-in fetch wrapper in `client/src/lib/queryClient.ts` injects
`X-Tenant-Slug` automatically from `localStorage` once the active slug is
known.  The slug is stored automatically after the first successful fetch of
`/api/tenants/current`.

You do **not** need to add the header manually in component code when using
`apiRequest()` or React Query with the default `getQueryFn`.

```ts
// ✅ Correct — header is added automatically
const res = await apiRequest("GET", "/api/products");

// ✅ Correct — React Query also injects the header
const { data } = useQuery({ queryKey: ["/api/products"] });
```

If you bypass the wrapper and call `fetch()` directly, you must add the header
yourself:

```ts
// ⚠️  Direct fetch — add the header explicitly
import { getActiveTenantSlug } from "@/lib/queryClient";

const slug = getActiveTenantSlug();
const res = await fetch("/api/products", {
  headers: slug ? { "X-Tenant-Slug": slug } : {},
  credentials: "include",
});
```

### Mobile / third-party clients

Include the header on every request:

```http
GET /api/products HTTP/1.1
Host: your-app.replit.app
Authorization: Bearer <jwt>
X-Tenant-Slug: paws-and-claws
```

Or use the query parameter alternative:

```
GET /api/products?tenant=paws-and-claws
```

---

## Authentication

Endpoints that require a logged-in user expect the JWT in one of:

* `Authorization: Bearer <token>` header
* `auth_token` cookie (set automatically by the login endpoint)

Super-admin endpoints additionally require the authenticated user to have
`isSuperAdmin: true` in the database.

---

## Error format

All error responses follow the same shape:

```json
{ "message": "Human-readable description of what went wrong." }
```

HTTP status codes follow standard semantics (`400` bad request, `401`
unauthenticated, `403` forbidden, `404` not found, `503` service unavailable).
