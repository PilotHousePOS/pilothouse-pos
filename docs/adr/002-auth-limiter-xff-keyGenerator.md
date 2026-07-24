# ADR 002 — authLimiter must use a socket-address keyGenerator, not req.ip

**Status:** Accepted  
**Date:** 2026-07-24  
**Deciders:** Engineering team  
**Affected files:** `server/routes.ts` (authLimiter), `server/tests/auth-limiter-xff-bypass.test.ts`

---

## Context

The application uses `express-rate-limit` to throttle credential-sensitive endpoints
(`/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`,
`/api/auth/reset-password`, `/api/auth/change-password`).

Express is configured with `app.set("trust proxy", 1)`, which makes `req.ip` resolve
to the **leftmost** `X-Forwarded-For` entry. That entry is fully attacker-controlled:
a client can prepend a different fake IP on every request from a single TCP connection.

### The attack

```
Request 1: X-Forwarded-For: 1.1.1.1, <real-proxy-ip>   → fresh bucket (0/15 used)
Request 2: X-Forwarded-For: 2.2.2.2, <real-proxy-ip>   → fresh bucket (0/15 used)
…
Request N: X-Forwarded-For: N.N.N.N, <real-proxy-ip>   → fresh bucket (0/15 used)
```

Using the default key (`req.ip` = leftmost XFF entry), every request opens a brand-new
per-IP counter. An attacker on a single connection can make **unlimited login attempts**,
enabling credential-stuffing and brute-force attacks against any account.

---

## Decision

The `authLimiter` (and every other auth-sensitive limiter: `signupLimiter`,
`generalLimiter`, `checkoutLimiter`, `searchLimiter`, `uploadLimiter`) uses a custom
`keyGenerator` that calls `getRealIp`:

```ts
function getRealIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const entries = (Array.isArray(xff) ? xff.join(',') : xff)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length > 0) return entries[entries.length - 1]; // RIGHTMOST
  }
  return (req as any).socket?.remoteAddress ?? 'unknown';
}
```

`getRealIp` returns the **rightmost** XFF entry — the one Replit's edge proxy appends
and that the client cannot forge. All requests from the same real connection share one
rate-limit bucket regardless of the spoofed leftmost prefix.

---

## Consequences

### If keyGenerator is kept (correct)

- Rotating the `X-Forwarded-For` leftmost value has no effect on the counter.
- An attacker on one connection is limited to 15 login attempts per 15-minute window.
- The regression test `server/tests/auth-limiter-xff-bypass.test.ts` passes.

### If keyGenerator is removed or replaced with a req.ip-based function (WRONG)

- Each request with a new spoofed leftmost IP gets a fresh counter.
- An attacker can make unlimited login attempts from a single connection.
- The bypass is silent: the server logs and metrics will look normal.
- The regression test will fail, surfacing the issue before production.

---

## Alternatives considered

| Option | Why rejected |
|---|---|
| Use `app.set("trust proxy", false)` | Breaks real client-IP detection for legitimate proxied traffic |
| Use the leftmost XFF entry | Exactly what the attacker controls — provides no protection |
| Move auth to a separate service with its own proxy | Overkill; the keyGenerator is a one-line fix |
| Rely on WAF/CDN rate limiting only | Defense in depth: both layers should enforce limits |

---

## Regression test

`server/tests/auth-limiter-xff-bypass.test.ts` simulates the attack:

1. 15 `POST /api/auth/login` requests, each with a unique spoofed leftmost XFF IP
   and the same fixed rightmost "real" IP.
2. All 15 are allowed through (the handler returns 401 for bad credentials, but the
   limiter counts them in the same bucket).
3. The 16th request (new spoofed prefix, same real IP) must return **429**.

If the keyGenerator is ever dropped, step 3 will return 401 instead of 429 and the
test will fail loudly.

---

## Review checklist for future changes to rate limiters

- [ ] Does the new/modified limiter use `keyGenerator: getRealIp`?
- [ ] Does a test verify it cannot be bypassed by XFF rotation?
- [ ] Is the limiter applied to **all** auth-sensitive paths?
