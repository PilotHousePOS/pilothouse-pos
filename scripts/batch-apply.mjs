import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

// Extract dimension and normalize (5" = 5in = 5)
function extractDimension(name) {
  // Match various dimension formats
  const patterns = [
    /(\d+\.?\d*)\s*["']/,           // 5", 9'
    /(\d+\.?\d*)\s*in\b/i,           // 5in, 5IN
    /(\d+\.?\d*)\s*inch/i,           // 5inch
  ];
  for (const p of patterns) {
    const match = name.match(p);
    if (match) return parseFloat(match[1]);
  }
  return null;
}

// Extract foot length
function extractFeet(name) {
  const match = name.match(/(\d+)\s*['ft]/i);
  return match ? parseInt(match[1]) : null;
}

// Extract cup capacity
function extractCup(name) {
  const match = name.match(/(\d+)\s*cup/i);
  return match ? parseInt(match[1]) : null;
}

async function main() {
  const matches = JSON.parse(fs.readFileSync('scripts/pending_matches.json', 'utf-8'));
  
  // Filter with strict dimension checking
  const good = matches.filter(m => {
    const db = m.supplyName.toLowerCase();
    const upc = m.upcName.toLowerCase();
    
    // Dimension check (normalized)
    const dbDim = extractDimension(m.supplyName);
    const upcDim = extractDimension(m.upcName);
    if (dbDim !== null && upcDim !== null && dbDim !== upcDim) {
      console.log(`REJECT dim: ${m.supplyName} (${dbDim}) vs ${m.upcName} (${upcDim})`);
      return false;
    }
    
    // Cup check
    const dbCup = extractCup(db);
    const upcCup = extractCup(upc);
    if (dbCup !== null && upcCup !== null && dbCup !== upcCup) {
      console.log(`REJECT cup: ${m.supplyName} vs ${m.upcName}`);
      return false;
    }
    
    // Foot length check
    const dbFt = extractFeet(db);
    const upcFt = extractFeet(upc);
    if (dbFt !== null && upcFt !== null && dbFt !== upcFt) {
      console.log(`REJECT ft: ${m.supplyName} vs ${m.upcName}`);
      return false;
    }
    
    return true;
  });
  
  console.log(`Applying ${good.length} of ${matches.length} matches...`);
  
  for (const m of good) {
    await db.update(supplies).set({ upc: m.upc }).where(eq(supplies.id, m.supplyId));
  }
  
  console.log('Done!');
  process.exit(0);
}

main().catch(console.error);
