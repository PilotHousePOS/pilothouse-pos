import fs from 'fs';

const QUEUE_FILE = 'scripts/match_queue.json';
const PENDING_FILE = 'scripts/all_pending_matches.json';
const DECISIONS_LOG = 'scripts/match_decisions_log.json';

// Load existing queue
let queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
const decisionsLog = JSON.parse(fs.readFileSync(DECISIONS_LOG, 'utf-8'));

console.log(`\n=== MERGING MATCHES TO QUEUE ===`);
console.log(`Existing queue: ${Object.keys(queue.matches).length} matches`);
console.log(`New pending: ${pending.length} matches`);

let added = 0;
let skipped = 0;

for (const match of pending) {
  const matchId = `${match.supplyId}-${match.upc}`;
  
  // Skip if already exists
  if (queue.matches[matchId]) {
    skipped++;
    continue;
  }
  
  queue.matches[matchId] = {
    matchId,
    supplyId: match.supplyId,
    supplyName: match.supplyName,
    brand: match.brand,
    upc: match.upc,
    upcName: match.upcName,
    score: match.score,
    status: 'pending',
    discoveredAt: new Date().toISOString(),
    reviewedAt: null,
    appliedAt: null,
    notes: null
  };
  added++;
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

// Log the merge action
decisionsLog.push({
  action: 'merge',
  timestamp: new Date().toISOString(),
  added,
  skipped,
  source: PENDING_FILE,
  totalInQueue: queue.totalDiscovered
});
fs.writeFileSync(DECISIONS_LOG, JSON.stringify(decisionsLog, null, 2));

console.log(`\n=== MERGE COMPLETE ===`);
console.log(`Added: ${added}`);
console.log(`Skipped (already exists): ${skipped}`);
console.log(`\nQueue stats:`);
console.log(`  Total: ${queue.totalDiscovered}`);
console.log(`  Pending: ${queue.stats.pending}`);
console.log(`  Accepted: ${queue.stats.accepted}`);
console.log(`  Rejected: ${queue.stats.rejected}`);
console.log(`  Applied: ${queue.stats.applied}`);
console.log(`\nSaved to ${QUEUE_FILE}`);
