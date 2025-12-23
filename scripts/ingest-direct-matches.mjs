import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, isNull } from 'drizzle-orm';

const QUEUE_FILE = 'scripts/match_queue.json';
const DECISIONS_LOG = 'scripts/match_decisions_log.json';
const MAYBE_FILE = 'scripts/maybe_upcs_clean_3171.json';

function normalize(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('\n=== INGESTING DIRECT MATCHES FROM MAYBE INVENTORY ===\n');
  
  const maybeUpcs = JSON.parse(fs.readFileSync(MAYBE_FILE, 'utf-8'));
  console.log(`Maybe inventory UPCs: ${maybeUpcs.length}`);
  
  // Get all unmatched supplies
  const unmatchedSupplies = await db.select().from(supplies).where(isNull(supplies.upc));
  console.log(`Unmatched supplies in DB: ${unmatchedSupplies.length}`);
  
  // Get already used UPCs
  const usedResult = await db.execute(sql`SELECT DISTINCT upc FROM supplies WHERE upc IS NOT NULL`);
  const usedUpcs = new Set(usedResult.rows.map(r => r.upc));
  console.log(`Already used UPCs: ${usedUpcs.size}`);
  
  // Build normalized name -> supply mapping
  const supplyByName = new Map();
  for (const s of unmatchedSupplies) {
    const normName = normalize(s.name);
    if (!supplyByName.has(normName)) {
      supplyByName.set(normName, s);
    }
  }
  console.log(`Unique normalized supply names: ${supplyByName.size}`);
  
  // Load existing queue
  let queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
  const decisionsLog = JSON.parse(fs.readFileSync(DECISIONS_LOG, 'utf-8'));
  
  let matched = 0;
  let alreadyUsed = 0;
  let noMatch = 0;
  let alreadyInQueue = 0;
  
  for (const upcItem of maybeUpcs) {
    // Skip if UPC already used in DB
    if (usedUpcs.has(upcItem.upc)) {
      alreadyUsed++;
      continue;
    }
    
    const normUpcName = normalize(upcItem.name);
    const supply = supplyByName.get(normUpcName);
    
    if (!supply) {
      noMatch++;
      continue;
    }
    
    const matchId = `${supply.id}-${upcItem.upc}`;
    
    // Skip if already in queue
    if (queue.matches[matchId]) {
      alreadyInQueue++;
      continue;
    }
    
    queue.matches[matchId] = {
      matchId,
      supplyId: supply.id,
      supplyName: supply.name,
      brand: supply.brand || 'UNKNOWN',
      upc: upcItem.upc,
      upcName: upcItem.name,
      score: 1.0,  // Exact match = 100%
      status: 'pending',
      matchType: 'direct_exact',
      discoveredAt: new Date().toISOString(),
      reviewedAt: null,
      appliedAt: null,
      notes: 'Direct exact name match from maybe inventory'
    };
    matched++;
    
    // Remove from available pool
    supplyByName.delete(normUpcName);
  }
  
  // Update stats
  queue.stats.pending = Object.values(queue.matches).filter(m => m.status === 'pending').length;
  queue.stats.accepted = Object.values(queue.matches).filter(m => m.status === 'accepted').length;
  queue.stats.rejected = Object.values(queue.matches).filter(m => m.status === 'rejected').length;
  queue.stats.applied = Object.values(queue.matches).filter(m => m.status === 'applied').length;
  queue.totalDiscovered = Object.keys(queue.matches).length;
  queue.lastUpdated = new Date().toISOString();
  queue.version = (queue.version || 0) + 1;
  
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  
  decisionsLog.push({
    action: 'ingest_direct_matches',
    timestamp: new Date().toISOString(),
    source: MAYBE_FILE,
    matched,
    alreadyUsed,
    noMatch,
    alreadyInQueue,
    totalInQueue: queue.totalDiscovered
  });
  fs.writeFileSync(DECISIONS_LOG, JSON.stringify(decisionsLog, null, 2));
  
  console.log(`\n=== INGESTION COMPLETE ===`);
  console.log(`Direct matches added: ${matched}`);
  console.log(`Already used in DB: ${alreadyUsed}`);
  console.log(`No name match: ${noMatch}`);
  console.log(`Already in queue: ${alreadyInQueue}`);
  console.log(`\nQueue stats:`);
  console.log(`  Total: ${queue.totalDiscovered}`);
  console.log(`  Pending: ${queue.stats.pending}`);
  console.log(`  Accepted: ${queue.stats.accepted}`);
  console.log(`  Applied: ${queue.stats.applied}`);
  
  process.exit(0);
}

main().catch(console.error);
