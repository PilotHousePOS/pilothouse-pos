# Threat Model

## Project Overview

Animal House Pet Store is a React/Vite frontend with an Express/TypeScript backend and PostgreSQL accessed through Drizzle ORM. Production features include public catalog browsing, customer accounts, appointments, e-commerce orders, Stripe-based payments, admin dashboards, email/SMS notifications, push notifications, job applications, and admin-side invoice/order-photo processing. The application integrates with Stripe, SendGrid, Twilio, Google services/object storage, Astro loyalty services, and OpenAI-powered document/image processing.

Production assumptions for this scan:
- Production runs with `NODE_ENV=production`.
- Replit-managed TLS protects browser-to-server transport.
- Mockup sandboxes are not deployed to production.
- Dev-only tooling and migration scripts are out of scope unless production reachability is demonstrated.

## Assets

- **User accounts and sessions** — customer/admin/groomer identities, JWTs, passkeys, password reset tokens, email verification tokens. Compromise enables impersonation and privilege abuse.
- **Customer and employee PII** — names, emails, phone numbers, addresses, appointment details, order history, job applications, and uploaded documents/photos. Exposure affects privacy and compliance.
- **Payment and order state** — Stripe customer/payment references, checkout session state, refunds, loyalty balances, charge-account flags, and order approval state. Tampering can cause fraud or financial loss.
- **Administrative business data** — inventory, pricing, promotions, legal pages, automated messaging settings, grooming schedules, POS/Astro sync state, and database import/export flows. Unauthorized access would affect business integrity.
- **Uploaded media and scanned documents** — product images, order photos, invoice scans, and other files stored locally or in object storage. Unsafe handling could expose sensitive content or enable malicious file abuse.
- **Application secrets and third-party credentials** — database URL, session secret, Stripe keys, SendGrid/Twilio credentials, VAPID keys, Google credentials, Astro credentials, and OpenAI API keys. Leakage could enable full service compromise.

## Trust Boundaries

- **Browser / API boundary** — all client input is untrusted. Every request must be validated, authenticated where required, and authorized server-side.
- **Public / authenticated / admin boundary** — public catalog and job application flows coexist with customer-only and admin/groomer-only endpoints. Role enforcement must happen on the server for every sensitive route.
- **API / database boundary** — the Express server has broad database access. Injection or authorization mistakes at the API layer can expose or modify most business data.
- **API / third-party services boundary** — the server makes privileged calls to Stripe, SendGrid, Twilio, Astro, Google services, OpenAI, and object storage. Requests crossing this boundary must not be attacker-steered without validation.
- **API / file and object storage boundary** — uploaded files and generated assets cross from untrusted input into server-side processing and public/static serving.
- **Production / dev-only boundary** — `server/scripts`, root migration helpers, Vite dev integration, and test endpoints should usually be treated as dev-only and ignored unless there is evidence they are reachable from production traffic.

## Scan Anchors

- **Primary production entry points:** `server/index.ts`, `server/routes.ts`, `client/src/main.tsx`.
- **Highest-risk server code:** `server/routes.ts`, `server/auth.ts`, `server/passwordUtils.ts`, `server/storage.ts`, `server/webhookHandlers.ts`, `server/objectStorageService.ts`, `server/orderPhotoProcessor.ts`, `server/stripeClient.ts`, `server/sendgrid*.ts`, `server/pushNotifications.ts`.
- **Role boundaries:** public catalog/job application routes; authenticated profile/cart/order/appointment routes; admin/groomer routes under `/api/admin/*` and related operational endpoints.
- **Additional production-relevant entry points discovered during scanning:** `/api/pos/webhook`, `/api/astro/link-account`, `/api/admin/order-photos`, `/api/objects/upload`, and `GET /objects/:objectPath(*)`.
- **Usually dev-only:** `server/scripts/**`, many root-level data-processing scripts, `server/vite.ts`, `/api/test/create-user` when guarded by development-only checks, and currently `server/replitAuth.ts` because `server/index.ts` initializes `registerRoutes()` and does not wire `setupAuth()` into the production app.

## Threat Categories

### Spoofing

Authentication is centered on JWTs, cookies, password-based login, email verification, password reset tokens, and optional passkeys. The system must reject forged or replayed credentials, require an unpredictable production signing secret, and enforce server-side role checks for admin and groomer actions. Third-party callbacks such as Stripe webhooks must be authenticated before any state change occurs.

### Tampering

Customers can influence carts, orders, appointment requests, uploads, and profile data; admins can trigger imports, inventory edits, refunds, and messaging workflows. The server must derive sensitive business values server-side, validate identifiers and request bodies, constrain file uploads, and prevent untrusted input from steering privileged downstream actions such as database writes, external API calls, or object-storage operations.

### Information Disclosure

The application stores substantial PII and operational data, plus Stripe/customer linkage and uploaded media. Responses, logs, static file serving, object access, and admin export features must only expose data to authorized principals. Secrets and tokens must never be embedded in client-reachable code or returned to unauthorized callers.

### Denial of Service

Public search, authentication, checkout, upload, invoice/photo processing, and external-integration paths can be resource intensive. Production endpoints must apply rate limits, request-size limits, and sensible timeouts so unauthenticated or low-privilege users cannot exhaust CPU, memory, storage, or third-party quotas.

### Elevation of Privilege

Because most business logic lives in a very large `server/routes.ts`, there is elevated risk of missed authorization checks, IDORs, and inconsistent role enforcement. The application must ensure every sensitive record fetch or mutation is scoped to the authenticated user or an authorized admin/groomer, and must prevent cross-origin or token-handling flaws from turning a customer session into broader account or admin compromise.
