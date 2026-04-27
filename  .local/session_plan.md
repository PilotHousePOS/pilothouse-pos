# Objective
Perform an in-depth production-scope security scan across the application, prioritizing vulnerabilities with real exploitability and meaningful impact.

# Relevant information
- Production entry points: `server/index.ts`, `server/routes.ts`, `client/src/main.tsx`.
- Backend: Express + TypeScript. Frontend: React/Vite. Database: PostgreSQL via Drizzle.
- Auth/session model: JWT-based auth in `server/auth.ts`, optional passkeys, cookie + Authorization-header support.
- High-risk trust boundaries: browser→API, public→authenticated→admin, API→database, API→third-party providers, API→file/object storage.
- Most business logic lives in `server/routes.ts` and inline permission checks, so missing authz and inconsistent request validation are likely classes to verify.
- Production assumptions from `threat_model.md`: `NODE_ENV=production`, TLS is provided by the platform, dev-only sandboxes/scripts are out of scope unless proven production-reachable.
- Usually dev-only / deprioritized unless production reachability appears: `server/scripts/**`, many root-level migration/data-processing scripts, `server/vite.ts`, `/api/test/create-user` guarded by development mode.
- Deterministic scans already run: SAST and HoundDog. Their output should be used as hints, not reported without validation.
- Early hypothesis already identified for validation: production CORS trust uses prefix matching in `server/index.ts`, which may allow attacker-controlled lookalike origins to receive credentialed API responses.

# Tasks

### T001: Authentication, session, CORS, and account lifecycle review
- **Blocked By**: []
- **Details**:
  - Analyze `server/auth.ts`, auth/account routes in `server/routes.ts`, password reset/email verification/passkey flows, cookie handling, token storage, and CORS.
  - Validate whether cross-origin requests, token exposure, fallback secrets, or account recovery paths can be exploited in production.
  - Files: `server/index.ts`, `server/auth.ts`, `server/passwordUtils.ts`, `server/replitAuth.ts`, `server/routes.ts`, `client/src/pages/auth.tsx`, `client/src/pages/verify-email.tsx`, `client/src/pages/forgot-password.tsx`, `client/src/pages/reset-password.tsx`, `shared/schema.ts`.
  - Acceptance: confirmed auth/session/cross-origin findings are documented with exact exploit path; benign issues are ruled out.

### T002: Customer data, orders, appointments, and access control review
- **Blocked By**: []
- **Details**:
  - Trace public and authenticated routes for profile/order/appointment/cart/job-application flows.
  - Look for IDORs, broken ownership checks, data overexposure, payment/order state tampering, and customer→admin boundary failures.
  - Files: `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`, client pages using `/api/orders`, `/api/appointments`, `/api/profile`, `/api/job-applications`.
  - Acceptance: every suspected broken-access-control or disclosure path is validated against actual route logic.

### T003: Admin, uploads, imports, and document-processing review
- **Blocked By**: []
- **Details**:
  - Review privileged admin endpoints, upload handlers, inventory/database import/export flows, object/media handling, and invoice/order-photo processing.
  - Look for missing admin enforcement, arbitrary file access, dangerous file exposure, unsafe parsing, or abuse of OCR/document-processing flows.
  - Files: `server/routes.ts`, `server/objectStorageService.ts`, `server/objectAcl.ts`, `server/orderPhotoProcessor.ts`, `server/storage.ts`, `shared/schema.ts`.
  - Acceptance: any production-reachable admin/upload/import weakness is confirmed with exact route and trust-boundary analysis.

### T004: External integrations, webhooks, notifications, and secret-handling review
- **Blocked By**: []
- **Details**:
  - Review Stripe, SendGrid, Twilio, Astro, push notifications, and webhook-handling code.
  - Look for missing callback verification, secret disclosure, attacker-controlled outbound requests, and sensitive data leakage in notifications or logs.
  - Files: `server/index.ts`, `server/webhookHandlers.ts`, `server/stripeClient.ts`, `server/sendgrid.ts`, `server/sendgridIntegration.ts`, `server/pushNotifications.ts`, `server/astroLoyalty.ts`, `server/notifications.ts`.
  - Acceptance: only concrete third-party-boundary vulnerabilities are reported.

### T005: SAST/HoundDog triage and synthesis
- **Blocked By**: [T001, T002, T003, T004]
- **Details**:
  - Compare validated code findings with deterministic scan hints.
  - Deduplicate, group by code area, update any relevant existing vulnerabilities, and prepare final report.
  - Acceptance: only real, production-relevant findings remain; `.local/new_vulnerabilities/` is grouped correctly before report.
