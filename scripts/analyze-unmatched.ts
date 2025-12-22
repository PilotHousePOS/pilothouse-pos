import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { isNull } from 'drizzle-orm';
import { expandAbbreviations } from '../server/abbreviationExpansion';
import * as fs from 'fs';

async function main() {
  const masterData = JSON.parse(fs.readFileSync('./scripts/master_upc_index.json', 'utf-8'));
  
  const unmatched = await db.select().from(supplies).where(isNull(supplies.upc));
  
  console.log('=== UNMATCHED SUPPLY ANALYSIS ===');
  console.log('Total unmatched:', unmatched.length);
  console.log('Master index entries:', masterData.entries.length);
  console.log();
  
  console.log('=== WHY THESE DONT MATCH ===\n');
  
  for (const s of unmatched.slice(0, 10)) {
    const expanded = expandAbbreviations(s.name);
    const words = expanded.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    const firstWord = words[0] || '';
    
    const candidates = masterData.entries.filter((e: any) => 
      e.name.toLowerCase().includes(firstWord)
    ).slice(0, 2);
    
    console.log('SUPPLY:', s.name);
    if (expanded !== s.name) console.log('  Expanded:', expanded);
    if (candidates.length > 0) {
      console.log('  Closest matches in master index:');
      candidates.forEach((c: any) => console.log('    -', c.name));
    } else {
      console.log('  NO entries contain word "' + firstWord + '"');
    }
    console.log();
  }
  
  // Count categories
  let noMatch = 0;
  const noMatchSamples: string[] = [];
  for (const s of unmatched) {
    const words = s.name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    const hasAny = words.some((w: string) => 
      masterData.entries.some((e: any) => e.name.toLowerCase().includes(w))
    );
    if (!hasAny) {
      noMatch++;
      if (noMatchSamples.length < 8) noMatchSamples.push(s.name);
    }
  }
  
  console.log('=== PRODUCTS NOT IN MASTER INDEX AT ALL ===');
  console.log('Count:', noMatch, 'of', unmatched.length);
  noMatchSamples.forEach(n => console.log('  -', n));
  
  process.exit(0);
}

main();
