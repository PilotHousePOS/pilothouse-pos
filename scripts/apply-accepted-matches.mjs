import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

const QUEUE_FILE = 'scripts/match_queue.json';
const APPLY_LOG = 'scripts/match_apply_log.json';
const DECISIONS_LOG = 'scripts/match_decisions_log.json';

async function main() {
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
  const applyLog = JSON.parse(fs.readFileSync(APPLY_LOG, 'utf-8'));
  const decisionsLog = JSON.parse(fs.readFileSync(DECISIONS_LOG, 'utf-8'));
  
  const accepted = Object.values(queue.matches).filter(m => m.status === 'accepted');
  
  console.log(`\n=== APPLYING ACCEPTED MATCHES ===`);
  console.log(`Accepted matches to apply: ${accepted.length}`);
  
  if (accepted.length === 0) {
    console.log('No accepted matches to apply.');
    process.exit(0);
  }
  
  let applied = 0;
  let failed = 0;
  const runLog = {
    timestamp: new Date().toISOString(),
    attempted: accepted.length,
    applied: 0,
    failed: 0,
    details: []
  };
  
  for (const match of accepted) {
    try {
      await db.update(supplies)
        .set({ upc: match.upc })
        .where(eq(supplies.id, match.supplyId));
      
      queue.matches[match.matchId].status = 'applied';
      queue.matches[match.matchId].appliedAt = new Date().toISOString();
      applied++;
      
      runLog.details.push({
        matchId: match.matchId,
        status: 'success',
        supplyId: match.supplyId,
        upc: match.upc
      });
    } catch (error) {
      failed++;
      runLog.details.push({
        matchId: match.matchId,
        status: 'error',
        error: error.message
      });
    }
  }
  
  runLog.applied = applied;
  runLog.failed = failed;
  
  // Update stats
  queue.stats.pending = Object.values(queue.matches).filter(m => m.status === 'pending').length;
  queue.stats.accepted = Object.values(queue.matches).filter(m => m.status === 'accepted').length;
  queue.stats.rejected = Object.values(queue.matches).filter(m => m.status === 'rejected').length;
  queue.stats.applied = Object.values(queue.matches).filter(m => m.status === 'applied').length;
  queue.lastUpdated = new Date().toISOString();
  
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  
  applyLog.push(runLog);
  fs.writeFileSync(APPLY_LOG, JSON.stringify(applyLog, null, 2));
  
  decisionsLog.push({
    action: 'apply',
    timestamp: new Date().toISOString(),
    applied,
    failed,
    remaining: queue.stats.pending
  });
  fs.writeFileSync(DECISIONS_LOG, JSON.stringify(decisionsLog, null, 2));
  
  console.log(`\n=== APPLY COMPLETE ===`);
  console.log(`Applied: ${applied}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nQueue stats:`);
  console.log(`  Pending: ${queue.stats.pending}`);
  console.log(`  Accepted: ${queue.stats.accepted}`);
  console.log(`  Rejected: ${queue.stats.rejected}`);
  console.log(`  Applied: ${queue.stats.applied}`);
  
  process.exit(0);
}

main().catch(console.error);
