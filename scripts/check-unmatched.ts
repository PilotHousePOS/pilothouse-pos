import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { isNull } from 'drizzle-orm';

const brandAbbreviations: Record<string, string[]> = {
  'science diet': ['sd', 'scidiet', 'sci diet', 'hill'],
  'blue buffalo': ['bb', 'bluebuff', 'blue buff', 'blue'],
  'royal canin': ['rc', 'royalc'],
  'pro plan': ['pp', 'proplan', 'purina pro'],
  'kong': ['kon', 'kng'],
  'zilla': ['zil', 'zla'],
  'zoo med': ['zm', 'zml', 'zoomed', 'zmed'],
  'exo terra': ['et', 'exot', 'exoterra'],
  'tetra': ['tet', 'tetr'],
  'hikari': ['hik', 'hikar'],
  'aqueon': ['aqe', 'aque'],
  'coastal': ['cst', 'coast'],
  'fluval': ['fluv'],
  'seachem': ['sli', 'sea', 'seach'],
  'api': ['api'],
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function expandAbbreviations(text: string): string {
  let expanded = normalizeText(text);
  for (const [full, abbrevs] of Object.entries(brandAbbreviations)) {
    for (const abbr of abbrevs) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  return expanded;
}

async function main() {
  // Get unmatched products
  const unmatched = await db.select({ id: supplies.id, name: supplies.name })
    .from(supplies)
    .where(isNull(supplies.sku))
    .limit(50);
  
  console.log('=== SAMPLE UNMATCHED PRODUCTS ===');
  for (const p of unmatched.slice(0, 30)) {
    console.log(`${p.id}: ${p.name}`);
  }
  
  // Load unused UPCs
  const googleSheet = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  const usedUpcs = new Set<string>();
  
  // Get used UPCs from database
  const matched = await db.select({ sku: supplies.sku }).from(supplies);
  for (const m of matched) {
    if (m.sku) usedUpcs.add(m.sku);
  }
  
  console.log('\n=== SAMPLE UNUSED UPCs FROM SOURCES ===');
  let count = 0;
  for (const line of googleSheet.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = parts[0].trim();
      const name = parts[1].trim();
      if (upc && name && !usedUpcs.has(upc) && count < 30) {
        console.log(`${upc}: ${name} -> expanded: ${expandAbbreviations(name)}`);
        count++;
      }
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
