// ─── PilotHouse POS — Local Persistent Store ──────────────────────────────────
//
// Two stores backed by plain JSON files in Electron's userData directory:
//
//   1. API response cache  — every successful GET /api/* response is saved here.
//      When the remote server is unreachable, the proxy serves from this cache
//      so all read-heavy pages (inventory, customers, appointments, settings)
//      load instantly without internet after the first online session.
//
//   2. Pending mutation queue — POST/PUT/PATCH/DELETE calls that fail because the
//      device is offline are saved here and replayed in order when the connection
//      returns.  Excluded: /api/stripe/*, /api/auth/*, /api/pos/offline-sync.
//
// Zero external dependencies — uses only Node.js built-ins (fs, path, crypto).
// All reads and writes are synchronous to keep the main-process request handler
// simple (no async/await plumbing through the proxy chain).

import fs     from 'fs';
import path   from 'path';
import crypto from 'crypto';
import { app } from 'electron';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CachedResponse {
  statusCode: number;
  /** Sanitised response headers (hop-by-hop headers stripped, cookies rewritten). */
  headers: Record<string, string | string[]>;
  body: string;
  cachedAt: number;   // unix ms
}

export interface PendingMutation {
  id:        string;
  method:    string;
  path:      string;    // full path including query string
  body:      string;    // serialised request body
  headers:   Record<string, string>;   // forwarding-safe subset of request headers
  queuedAt:  number;   // unix ms
  attempts:  number;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'pilothouse-cache');
}

function mutationsFile(): string {
  return path.join(app.getPath('userData'), 'pilothouse-mutations.json');
}

function ensureDirs(): void {
  const cd = cacheDir();
  if (!fs.existsSync(cd)) {
    try { fs.mkdirSync(cd, { recursive: true }); } catch { /* ignore */ }
  }
}

// ── API response cache ────────────────────────────────────────────────────────

/** SHA-256 of the URL path → deterministic safe filename */
function pathKey(urlPath: string): string {
  return crypto.createHash('sha256').update(urlPath).digest('hex');
}

/**
 * Persist a successful GET response so it can be served when offline.
 * Failures are silently swallowed — a missing cache entry is not fatal.
 */
export function cacheResponse(urlPath: string, entry: CachedResponse): void {
  try {
    ensureDirs();
    fs.writeFileSync(
      path.join(cacheDir(), pathKey(urlPath) + '.json'),
      JSON.stringify(entry),
      'utf8',
    );
  } catch { /* non-fatal */ }
}

/** Returns the cached response for urlPath, or null if not cached. */
export function getCachedResponse(urlPath: string): CachedResponse | null {
  try {
    const file = path.join(cacheDir(), pathKey(urlPath) + '.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CachedResponse;
  } catch {
    return null;
  }
}

// ── Mutation queue ────────────────────────────────────────────────────────────

function readMutations(): PendingMutation[] {
  try {
    const f = mutationsFile();
    if (!fs.existsSync(f)) return [];
    return JSON.parse(fs.readFileSync(f, 'utf8')) as PendingMutation[];
  } catch {
    return [];
  }
}

function writeMutations(mutations: PendingMutation[]): void {
  try {
    fs.writeFileSync(mutationsFile(), JSON.stringify(mutations, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

/** Append a mutation to the queue. Returns the generated id. */
export function queueMutation(
  mutation: Omit<PendingMutation, 'id' | 'attempts'>,
): string {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const mutations = readMutations();
  mutations.push({ ...mutation, id, attempts: 0 });
  writeMutations(mutations);
  return id;
}

/** Total number of mutations waiting to be replayed. */
export function pendingMutationCount(): number {
  return readMutations().length;
}

/** Remove a mutation from the queue (after successful replay). */
export function popMutation(id: string): void {
  writeMutations(readMutations().filter(m => m.id !== id));
}

/** Increment retry counter for a mutation that failed replay. */
export function bumpMutationAttempts(id: string): void {
  writeMutations(
    readMutations().map(m => m.id === id ? { ...m, attempts: m.attempts + 1 } : m),
  );
}

/** Return the oldest `limit` pending mutations (FIFO replay order). */
export function getOldestMutations(limit = 50): PendingMutation[] {
  return readMutations().slice(0, limit);
}
