import fs from 'fs';

const QUEUE_FILE = 'scripts/match_queue.json';
const DECISIONS_LOG = 'scripts/match_decisions_log.json';

const minScore = parseFloat(process.argv[2]) || 0.75;

const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
const decisionsLog = JSON.parse(fs.readFileSync(DECISIONS_LOG, 'utf-8'));

console.log(`\n=== ACCEPTING HIGH-SCORE MATCHES (>= ${minScore}) ===`);

let accepted = 0;
const pending = Object.values(queue.matches).filter(m => m.status === 'pending');

for (const match of pending) {
  if (match.score >= minScore) {
    queue.matches[match.matchId].status = 'accepted';
    queue.matches[match.matchId].reviewedAt = new Date().toISOString();
    queue.matches[match.matchId].notes = `Auto-accepted: score ${match.score.toFixed(2)} >= ${minScore}`;
    accepted++;
  }
}

// Update stats
queue.stats.pending = Object.values(queue.matches).filter(m => m.status === 'pending').length;
queue.stats.accepted = Object.values(queue.matches).filter(m => m.status === 'accepted').length;
queue.stats.rejected = Object.values(queue.matches).filter(m => m.status === 'rejected').length;
queue.stats.applied = Object.values(queue.matches).filter(m => m.status === 'applied').length;
queue.lastUpdated = new Date().toISOString();

fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));

decisionsLog.push({
  action: 'bulk_accept',
  timestamp: new Date().toISOString(),
  minScore,
  accepted,
  criteria: `score >= ${minScore}`
});
fs.writeFileSync(DECISIONS_LOG, JSON.stringify(decisionsLog, null, 2));

console.log(`Accepted: ${accepted} matches`);
console.log(`Remaining pending: ${queue.stats.pending}`);
console.log(`\nTo apply, run: npx tsx scripts/apply-accepted-matches.mjs`);
