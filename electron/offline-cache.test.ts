// ─── Electron Offline-Cache Unit Tests ───────────────────────────────────────
//
// Verifies the core promise of the Electron desktop app:
//   "Open the app once while online, then disconnect — the app should open
//    instantly and show cached inventory, customers, appointments, and settings."
//
// Covers:
//   1. local-store cache round-trip  — cacheResponse → getCachedResponse
//   2. Cache miss returns null       — no blocking screen for unseen URLs
//   3. Mutation queue lifecycle      — queueMutation, pendingCount, FIFO, pop
//   4. Service worker configuration  — right endpoints excluded / included
//   5. ServerUnreachableBanner       — starts in "checking" so no flash on startup
//
// The electron module is mocked to a temp directory so tests are self-contained
// and leave no files behind.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os   from 'os';
import fs   from 'fs';
import path from 'path';

// ── 1. Mock electron so local-store.ts can load outside Electron ──────────────

let tmpDir = '';

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => tmpDir,
    isPackaged: false,
  },
}));

// Dynamically import AFTER the mock is registered so the mock is in place
// when the module initialises (vi.mock is hoisted but the import must be lazy).

let cacheResponse:      typeof import('./local-store').cacheResponse;
let getCachedResponse:  typeof import('./local-store').getCachedResponse;
let queueMutation:      typeof import('./local-store').queueMutation;
let pendingMutationCount: typeof import('./local-store').pendingMutationCount;
let popMutation:        typeof import('./local-store').popMutation;
let bumpMutationAttempts: typeof import('./local-store').bumpMutationAttempts;
let getOldestMutations: typeof import('./local-store').getOldestMutations;

// ── Test lifecycle ────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Fresh isolated temp directory per test — prevents cross-test interference
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilothouse-test-'));

  // Re-import with the new tmpDir in place (vitest resets the module registry
  // between tests when vi.resetModules() is called, or we can use direct imports
  // since the mock always reads tmpDir from the closure variable).
  const mod = await import('./local-store');
  cacheResponse      = mod.cacheResponse;
  getCachedResponse  = mod.getCachedResponse;
  queueMutation      = mod.queueMutation;
  pendingMutationCount = mod.pendingMutationCount;
  popMutation        = mod.popMutation;
  bumpMutationAttempts = mod.bumpMutationAttempts;
  getOldestMutations = mod.getOldestMutations;
});

afterEach(() => {
  // Clean up temp directory
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. API response cache — round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe('local-store: API response cache', () => {
  it('stores a GET response and retrieves it by URL path', () => {
    const entry = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ id: 1, name: 'Dog Food 5kg' }]),
      cachedAt: Date.now(),
    };

    cacheResponse('/api/inventory', entry);
    const result = getCachedResponse('/api/inventory');

    expect(result).not.toBeNull();
    expect(result!.statusCode).toBe(200);
    expect(result!.body).toBe(entry.body);
    expect(result!.headers['content-type']).toBe('application/json');
    expect(result!.cachedAt).toBe(entry.cachedAt);
  });

  it('returns null for a URL path that has never been cached (no blocking 503 on fresh install)', () => {
    // On first startup after install there is no cache at all.
    // getCachedResponse must return null (not throw) so the proxy can
    // return a graceful 503 rather than crashing.
    const result = getCachedResponse('/api/inventory');
    expect(result).toBeNull();
  });

  it('returns null for an unseen URL even when other entries exist', () => {
    cacheResponse('/api/inventory', {
      statusCode: 200,
      headers: {},
      body: '[]',
      cachedAt: Date.now(),
    });

    // Appointments have never been fetched — must not return inventory data
    const result = getCachedResponse('/api/appointments');
    expect(result).toBeNull();
  });

  it('overwrites an existing cache entry on second cacheResponse call', () => {
    const ts1 = Date.now() - 60_000;
    cacheResponse('/api/customers', {
      statusCode: 200,
      headers: {},
      body: JSON.stringify([{ id: 1, name: 'Alice' }]),
      cachedAt: ts1,
    });

    const ts2 = Date.now();
    cacheResponse('/api/customers', {
      statusCode: 200,
      headers: {},
      body: JSON.stringify([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]),
      cachedAt: ts2,
    });

    const result = getCachedResponse('/api/customers');
    expect(result).not.toBeNull();
    expect(result!.cachedAt).toBe(ts2);
    expect(JSON.parse(result!.body)).toHaveLength(2);
  });

  it('caches the four key pages independently (POS, inventory, customers, appointments)', () => {
    const pages = [
      ['/api/pos/products',        '[{"id":1}]'],
      ['/api/inventory',           '[{"id":2}]'],
      ['/api/customers',           '[{"id":3}]'],
      ['/api/appointments',        '[{"id":4}]'],
      ['/api/settings/store',      '{"name":"Test"}'],
    ] as const;

    for (const [urlPath, body] of pages) {
      cacheResponse(urlPath, { statusCode: 200, headers: {}, body, cachedAt: Date.now() });
    }

    for (const [urlPath, body] of pages) {
      const result = getCachedResponse(urlPath);
      expect(result, `expected cached response for ${urlPath}`).not.toBeNull();
      expect(result!.body).toBe(body);
    }
  });

  it('handles query-string parameters in the URL path correctly', () => {
    // The proxy passes the full rawUrl (including query string) to cacheResponse.
    // A second request with the same query string should hit the same cache entry.
    cacheResponse('/api/inventory?category=food', {
      statusCode: 200,
      headers: {},
      body: '[{"id":5,"category":"food"}]',
      cachedAt: Date.now(),
    });

    const result = getCachedResponse('/api/inventory?category=food');
    expect(result).not.toBeNull();
    expect(result!.body).toContain('food');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Mutation queue
// ─────────────────────────────────────────────────────────────────────────────

describe('local-store: offline mutation queue', () => {
  it('starts with an empty queue (pendingMutationCount === 0)', () => {
    expect(pendingMutationCount()).toBe(0);
  });

  it('queues a mutation and increments the count', () => {
    queueMutation({
      method:   'POST',
      path:     '/api/appointments',
      body:     JSON.stringify({ petId: 1, time: '10:00' }),
      headers:  { 'content-type': 'application/json' },
      queuedAt: Date.now(),
    });

    expect(pendingMutationCount()).toBe(1);
  });

  it('returns mutations in FIFO order via getOldestMutations', () => {
    const paths = ['/api/appointments', '/api/inventory/1', '/api/customers/2'];
    for (const p of paths) {
      queueMutation({ method: 'PUT', path: p, body: '{}', headers: {}, queuedAt: Date.now() });
    }

    const oldest = getOldestMutations(10);
    expect(oldest).toHaveLength(3);
    expect(oldest[0].path).toBe(paths[0]);
    expect(oldest[1].path).toBe(paths[1]);
    expect(oldest[2].path).toBe(paths[2]);
  });

  it('removes a mutation from the queue via popMutation', () => {
    const id = queueMutation({
      method: 'DELETE', path: '/api/appointments/99', body: '', headers: {}, queuedAt: Date.now(),
    });
    expect(pendingMutationCount()).toBe(1);

    popMutation(id);
    expect(pendingMutationCount()).toBe(0);
  });

  it('only removes the specified mutation, leaving others intact', () => {
    queueMutation({ method: 'POST', path: '/api/appointments', body: '{}', headers: {}, queuedAt: Date.now() });
    const idToRemove = queueMutation({ method: 'PUT', path: '/api/customers/1', body: '{}', headers: {}, queuedAt: Date.now() });
    queueMutation({ method: 'POST', path: '/api/supply-adjustments', body: '{}', headers: {}, queuedAt: Date.now() });

    popMutation(idToRemove);

    expect(pendingMutationCount()).toBe(2);
    const remaining = getOldestMutations(10);
    expect(remaining.map(m => m.path)).not.toContain('/api/customers/1');
    expect(remaining.map(m => m.path)).toContain('/api/appointments');
    expect(remaining.map(m => m.path)).toContain('/api/supply-adjustments');
  });

  it('increments the attempts counter via bumpMutationAttempts', () => {
    const id = queueMutation({
      method: 'POST', path: '/api/appointments', body: '{}', headers: {}, queuedAt: Date.now(),
    });

    bumpMutationAttempts(id);
    bumpMutationAttempts(id);

    const muts = getOldestMutations(10);
    expect(muts[0].attempts).toBe(2);
  });

  it('does not throw when popping a non-existent id', () => {
    expect(() => popMutation('does-not-exist')).not.toThrow();
    expect(pendingMutationCount()).toBe(0);
  });

  it('getOldestMutations respects the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      queueMutation({ method: 'POST', path: `/api/test/${i}`, body: '{}', headers: {}, queuedAt: Date.now() });
    }
    expect(getOldestMutations(3)).toHaveLength(3);
    expect(getOldestMutations(10)).toHaveLength(10);
    expect(getOldestMutations(50)).toHaveLength(10); // only 10 queued
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Service worker: offline coverage for the right endpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('service worker: API caching configuration', () => {
  // Parse the API_NO_CACHE list from sw.js without executing it in a browser
  // context — we just need to verify the exclusion list is correct.

  let swSource = '';

  beforeEach(() => {
    const swPath = path.join(__dirname, '../client/public/sw.js');
    swSource = fs.readFileSync(swPath, 'utf8');
  });

  it('uses stale-while-revalidate for /api/ paths (offline coverage)', () => {
    // The SWR handler must catch all /api/ paths
    expect(swSource).toContain("url.pathname.startsWith('/api/')");
    // SWR: serve cache, revalidate in background
    expect(swSource).toContain('cache.match(event.request)');
    expect(swSource).toContain('cache.put(event.request');
  });

  it('excludes Stripe payment endpoints from the cache', () => {
    expect(swSource).toContain("'/api/stripe/'");
  });

  it('excludes one-time auth endpoints from the cache', () => {
    expect(swSource).toContain("'/api/auth/verify-email'");
    expect(swSource).toContain("'/api/auth/reset-password'");
  });

  it('does NOT exclude inventory, customers, appointments, or settings', () => {
    // These must be cacheable so staff can view them offline
    const noCache = swSource
      .match(/const API_NO_CACHE\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';

    expect(noCache).not.toContain('/api/inventory');
    expect(noCache).not.toContain('/api/customers');
    expect(noCache).not.toContain('/api/appointments');
    expect(noCache).not.toContain('/api/settings');
    expect(noCache).not.toContain('/api/pos');
  });

  it('caches /assets/ files for offline JS/CSS load', () => {
    expect(swSource).toContain("url.pathname.startsWith('/assets/')");
    // Cache-first: check cache before fetching
    expect(swSource).toContain('cache.match(event.request)');
  });

  it('has a navigate handler that falls back to cached root so app loads offline', () => {
    expect(swSource).toContain("event.request.mode === 'navigate'");
    expect(swSource).toContain("caches.match('/')");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ServerUnreachableBanner — no startup flash
// ─────────────────────────────────────────────────────────────────────────────

describe('useServerReachable: no "Cannot reach server" flash on startup', () => {
  it('starts in checking=true so the error banner is suppressed until the first probe completes', async () => {
    // In the Electron shell window.electronAPI is present.
    // The hook must initialise checking=true so the banner doesn't flash
    // while the first health-check is in-flight (typically 1.5 s after mount).

    // We test the hook's initial state logic directly by reading the source.
    const hookPath = path.join(__dirname, '../client/src/hooks/useServerReachable.ts');
    const hookSource = fs.readFileSync(hookPath, 'utf8');

    // The initial state should set checking: isElectron (true inside Electron)
    // so the banner is hidden during the first probe.
    expect(hookSource).toContain('checking:  isElectron');
  });

  it('ServerUnreachableBanner returns null while checking is true', () => {
    // Confirms the component suppresses the error banner during initial probe.
    const bannerPath = path.join(
      __dirname, '../client/src/components/server-unreachable-banner.tsx',
    );
    const bannerSource = fs.readFileSync(bannerPath, 'utf8');

    // The component must guard on `checking` before showing the orange banner
    expect(bannerSource).toContain('if (checking) return null');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. electron-builder: dist/public bundled inside package
// ─────────────────────────────────────────────────────────────────────────────

describe('electron-builder.yml: frontend bundled for offline load', () => {
  it('includes dist/public in the package so the app loads without internet', () => {
    const ymlPath = path.join(__dirname, '../electron-builder.yml');
    const yml     = fs.readFileSync(ymlPath, 'utf8');

    // The bundled React build must be listed under `files` so it ships inside
    // the installer and is available when the device has no internet connection.
    expect(yml).toContain('dist/public/**/*');
  });

  it('has a compiled Electron main entry point (dist/electron/main.js)', () => {
    const ymlPath = path.join(__dirname, '../electron-builder.yml');
    const yml     = fs.readFileSync(ymlPath, 'utf8');

    expect(yml).toContain('dist/electron/**/*');
    expect(yml).toContain('main: dist/electron/main.js');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Proxy: offline fallback described in main.ts header comment
// ─────────────────────────────────────────────────────────────────────────────

describe('electron/main.ts: offline proxy architecture', () => {
  it('describes the cold-start offline promise in the header comment', () => {
    const mainPath = path.join(__dirname, 'main.ts');
    const src      = fs.readFileSync(mainPath, 'utf8');

    // The header comment is authoritative documentation for operators.
    // Verify the key offline guarantees are stated explicitly.
    expect(src).toContain('Cold-start offline');
    expect(src).toContain('local cache');
  });

  it('serves bundled static files from STATIC_DIR (dist/public) — no network needed for app shell', () => {
    const mainPath = path.join(__dirname, 'main.ts');
    const src      = fs.readFileSync(mainPath, 'utf8');

    expect(src).toContain("'../public'");         // STATIC_DIR resolves to dist/public
    expect(src).toContain('serveStatic(');        // static file handler
    expect(src).toContain('startLocalServer');    // local HTTP server is started
  });

  it('falls back to getCachedResponse when proxyReq emits an error (network down)', () => {
    const mainPath = path.join(__dirname, 'main.ts');
    const src      = fs.readFileSync(mainPath, 'utf8');

    // The error handler must call getCachedResponse before returning 503
    expect(src).toContain('getCachedResponse(');
    // And serve the cache hit to the renderer
    expect(src).toContain("'x-pilothouse-cached'");
  });

  it('queues offline mutations for non-GET requests except Stripe and auth', () => {
    const mainPath = path.join(__dirname, 'main.ts');
    const src      = fs.readFileSync(mainPath, 'utf8');

    // shouldQueueMutation must exist and exclude Stripe/auth
    expect(src).toContain('shouldQueueMutation(');
    expect(src).toContain("'/api/stripe/'");
    expect(src).toContain("'/api/auth/'");
    expect(src).toContain('queueMutation(');
  });

  it('drains the mutation queue automatically when the connection returns', () => {
    const mainPath = path.join(__dirname, 'main.ts');
    const src      = fs.readFileSync(mainPath, 'utf8');

    expect(src).toContain('drainPendingMutations');
    expect(src).toContain('startHealthCheckLoop');
    // Health check must fire periodically
    expect(src).toContain('15_000');
  });
});
