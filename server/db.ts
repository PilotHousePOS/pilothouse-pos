import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Lazy initialization - don't connect until first use
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getPool(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }
    _pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
      max: 20,
      allowExitOnIdle: true,
    });
    
    _pool.on('error', (err) => {
      console.error('Unexpected pool error:', err);
      _pool = null;
      _db = null;
    });
  }
  return _pool;
}

export function resetPool(): void {
  if (_pool) {
    _pool.end().catch(console.error);
  }
  _pool = null;
  _db = null;
}

function getDb(): ReturnType<typeof drizzle> {
  if (!_db) {
    _db = drizzle({ client: getPool(), schema });
  }
  return _db;
}

// Export getters that use lazy initialization
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    return (getPool() as any)[prop];
  }
});

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    const realDb = getDb();
    const value = (realDb as any)[prop];
    // Bind functions to the real db instance
    if (typeof value === 'function') {
      return value.bind(realDb);
    }
    return value;
  }
});