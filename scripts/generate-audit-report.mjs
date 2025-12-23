import fs from 'fs';

const queue = JSON.parse(fs.readFileSync('scripts/match_queue.json', 'utf-8'));
const applied = Object.values(queue.matches).filter(m => m.status === 'applied');

const audit = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalApplied: applied.length,
    byScoreRange: {
      '100%': applied.filter(m => m.score === 1.0).length,
      '90-99%': applied.filter(m => m.score >= 0.90 && m.score < 1.0).length,
      '80-89%': applied.filter(m => m.score >= 0.80 && m.score < 0.90).length,
      '70-79%': applied.filter(m => m.score >= 0.70 && m.score < 0.80).length,
    },
    byMatchType: {}
  },
  potentialIssues: [],
  allMatches: []
};

// Count by match type
applied.forEach(m => {
  const type = m.matchType || 'standard';
  audit.summary.byMatchType[type] = (audit.summary.byMatchType[type] || 0) + 1;
});

// Flag potential issues
applied.forEach(m => {
  const issues = [];
  
  // Cross-brand matches need review
  if (m.upcBrand && m.brand && m.upcBrand !== 'UNKNOWN' && 
      m.upcBrand.toLowerCase() !== m.brand.toLowerCase()) {
    issues.push(`Brand mismatch: DB=${m.brand}, UPC=${m.upcBrand}`);
  }
  
  // Lower scores need review
  if (m.score < 0.80) {
    issues.push(`Low score: ${(m.score * 100).toFixed(0)}%`);
  }
  
  // Check for size words in one but not other
  const sizeWords = ['small', 'medium', 'large', 'mini', 'jumbo', 'giant', 'xs', 'xl', 'xxl'];
  const dbLower = (m.supplyName || '').toLowerCase();
  const upcLower = (m.upcName || '').toLowerCase();
  
  for (const size of sizeWords) {
    const inDb = dbLower.includes(size);
    const inUpc = upcLower.includes(size);
    if (inDb !== inUpc) {
      issues.push(`Size word "${size}" in ${inDb ? 'DB only' : 'UPC only'}`);
      break;
    }
  }
  
  if (issues.length > 0) {
    audit.potentialIssues.push({
      supplyId: m.supplyId,
      supplyName: m.supplyName,
      upc: m.upc,
      upcName: m.upcName,
      score: m.score,
      brand: m.brand,
      upcBrand: m.upcBrand,
      issues
    });
  }
  
  audit.allMatches.push({
    supplyId: m.supplyId,
    supplyName: m.supplyName,
    upc: m.upc,
    upcName: m.upcName,
    score: m.score,
    brand: m.brand,
    matchType: m.matchType || 'standard'
  });
});

// Sort potential issues by score (lowest first - most risky)
audit.potentialIssues.sort((a, b) => a.score - b.score);

fs.writeFileSync('scripts/audit_report.json', JSON.stringify(audit, null, 2));

console.log('=== AUDIT REPORT SAVED ===\n');
console.log('Total applied:', audit.summary.totalApplied);
console.log('\nBy score range:');
Object.entries(audit.summary.byScoreRange).forEach(([range, count]) => {
  console.log(`  ${range}: ${count}`);
});
console.log('\nBy match type:');
Object.entries(audit.summary.byMatchType).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});
console.log('\nPotential issues flagged:', audit.potentialIssues.length);
console.log('\nSaved to: scripts/audit_report.json');

// Show top 15 issues
if (audit.potentialIssues.length > 0) {
  console.log('\n=== TOP FLAGGED ITEMS FOR REVIEW ===\n');
  audit.potentialIssues.slice(0, 15).forEach((item, i) => {
    console.log(`${i+1}. [${(item.score*100).toFixed(0)}%] ${item.brand}`);
    console.log(`   DB:  ${item.supplyName}`);
    console.log(`   UPC: ${item.upcName}`);
    console.log(`   Issues: ${item.issues.join(', ')}`);
    console.log('');
  });
}
