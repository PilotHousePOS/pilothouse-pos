// ─── PilotHouse Offline IndexedDB ─────────────────────────────────────────────
// Stores:
//   offline_sales — cash sales queued while internet was down
//   pos_cache     — last-good API responses (roster, layout, tax rate, etc.)

const DB_NAME    = 'pilothouse-offline';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('offline_sales')) {
        db.createObjectStore('offline_sales', { keyPath: 'localId' });
      }
      if (!db.objectStoreNames.contains('pos_cache')) {
        db.createObjectStore('pos_cache', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { _db = (e.target as IDBOpenDBRequest).result; resolve(_db!); };
    req.onerror  = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

// ── Offline sales queue ──────────────────────────────────────────────────────

export interface OfflineSale {
  localId: string;
  orderNumber: string;
  items: any[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  amountTendered?: number;
  changeDue?: number;
  operatorName?: string;
  offlineQueuedAt: string; // ISO timestamp — when the sale actually happened
}

export async function queueOfflineSale(sale: Omit<OfflineSale, 'localId'>): Promise<string> {
  const db = await openDb();
  const localId = `offline-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    tx.objectStore('offline_sales').put({ ...sale, localId });
    tx.oncomplete = () => resolve(localId);
    tx.onerror    = () => reject(tx.error);
  });
}

export async function getPendingOfflineSales(): Promise<OfflineSale[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('offline_sales', 'readonly');
    const req = tx.objectStore('offline_sales').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

export async function removeOfflineSale(localId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_sales', 'readwrite');
    tx.objectStore('offline_sales').delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function countPendingOfflineSales(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('offline_sales', 'readonly');
    const req = tx.objectStore('offline_sales').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── API response cache ───────────────────────────────────────────────────────

export async function setCacheEntry(key: string, value: any): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pos_cache', 'readwrite');
    tx.objectStore('pos_cache').put({ key, value, cachedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function getCacheEntry<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('pos_cache', 'readonly');
    const req = tx.objectStore('pos_cache').get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror   = () => reject(req.error);
  });
}
