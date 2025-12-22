import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';

interface UpcCatalogEntry {
  upc: string;
  names: string[];
  sources: { type: string; count: number }[];
  primaryName: string;
}

interface UpcCatalog {
  totalUniqueUpcs: number;
  entries: UpcCatalogEntry[];
}

interface MatchResult {
  supplyId: number;
  supplyName: string;
  matchedUpc: string;
  matchMethod: 'exact_name' | 'token_match';
  confidence: number;
  catalogName: string;
}

function normalizeForIndex(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractTokens(str: string): string[] {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

async function matchUpcsToSupplies() {
  console.log('=== MATCHING UPCs TO SUPPLIES ===\n');

  const catalog: UpcCatalog = JSON.parse(fs.readFileSync('scripts/upc_catalog.json', 'utf-8'));
  console.log(`Loaded UPC catalog: ${catalog.totalUniqueUpcs} unique UPCs`);

  const allSupplies = await db.select().from(supplies);
  console.log(`Loaded supplies: ${allSupplies.length} items`);

  const suppliesWithoutUpc = allSupplies.filter(s => !s.sku || s.sku.trim() === '');
  const suppliesWithUpc = allSupplies.filter(s => s.sku && s.sku.trim() !== '');
  console.log(`Supplies with UPC: ${suppliesWithUpc.length}`);
  console.log(`Supplies without UPC: ${suppliesWithoutUpc.length}`);

  console.log('\nBuilding search indexes...');

  const nameToEntries = new Map<string, { entry: UpcCatalogEntry; originalName: string }[]>();
  const tokenIndex = new Map<string, UpcCatalogEntry[]>();

  for (const entry of catalog.entries) {
    for (const name of entry.names) {
      const normalized = normalizeForIndex(name);
      if (!nameToEntries.has(normalized)) {
        nameToEntries.set(normalized, []);
      }
      nameToEntries.get(normalized)!.push({ entry, originalName: name });

      const tokens = extractTokens(name);
      for (const token of tokens) {
        if (!tokenIndex.has(token)) tokenIndex.set(token, []);
        const list = tokenIndex.get(token)!;
        if (!list.includes(entry)) list.push(entry);
      }
    }
  }

  console.log(`Name index: ${nameToEntries.size} normalized keys`);
  console.log(`Token index: ${tokenIndex.size} tokens`);

  const matches: MatchResult[] = [];
  const unmatched: { id: number; name: string; brand: string | null }[] = [];

  let exactMatches = 0;
  let tokenMatches = 0;

  console.log('\nMatching supplies...');

  for (const supply of suppliesWithoutUpc) {
    const supplyNormalized = normalizeForIndex(supply.name);
    const supplyLower = supply.name.toLowerCase().trim();

    const candidates = nameToEntries.get(supplyNormalized);
    if (candidates) {
      let exactMatch: { entry: UpcCatalogEntry; originalName: string } | null = null;
      for (const cand of candidates) {
        if (cand.originalName.toLowerCase().trim() === supplyLower) {
          exactMatch = cand;
          break;
        }
      }

      if (exactMatch) {
        matches.push({
          supplyId: supply.id,
          supplyName: supply.name,
          matchedUpc: exactMatch.entry.upc,
          matchMethod: 'exact_name',
          confidence: 1.0,
          catalogName: exactMatch.originalName
        });
        exactMatches++;
        continue;
      }
    }

    const supplyTokens = extractTokens(supply.name);
    if (supplyTokens.length === 0) {
      unmatched.push({ id: supply.id, name: supply.name, brand: supply.brand });
      continue;
    }

    const candidateCounts = new Map<UpcCatalogEntry, number>();
    for (const token of supplyTokens) {
      const entries = tokenIndex.get(token) || [];
      for (const entry of entries) {
        candidateCounts.set(entry, (candidateCounts.get(entry) || 0) + 1);
      }
    }

    let bestMatch: { entry: UpcCatalogEntry; score: number; matchedName: string } | null = null;
    for (const [entry, matchedTokens] of candidateCounts) {
      for (const name of entry.names) {
        const entryTokens = extractTokens(name);
        const overlap = matchedTokens / Math.max(supplyTokens.length, entryTokens.length);
        if (overlap > 0.6 && (!bestMatch || overlap > bestMatch.score)) {
          bestMatch = { entry, score: overlap, matchedName: name };
        }
      }
    }

    if (bestMatch && bestMatch.score >= 0.7) {
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        matchedUpc: bestMatch.entry.upc,
        matchMethod: 'token_match',
        confidence: bestMatch.score,
        catalogName: bestMatch.matchedName
      });
      tokenMatches++;
    } else {
      unmatched.push({ id: supply.id, name: supply.name, brand: supply.brand });
    }
  }

  fs.writeFileSync('scripts/upc_matches.json', JSON.stringify(matches, null, 2));
  fs.writeFileSync('scripts/unmatched_supplies.json', JSON.stringify(unmatched, null, 2));

  console.log('\n=== MATCHING RESULTS ===');
  console.log(`Already have UPC: ${suppliesWithUpc.length}`);
  console.log(`New matches found: ${matches.length}`);
  console.log(`  - Exact name: ${exactMatches}`);
  console.log(`  - Token match: ${tokenMatches}`);
  console.log(`Still unmatched: ${unmatched.length}`);

  const totalCoverage = suppliesWithUpc.length + matches.length;
  const percentage = (totalCoverage / allSupplies.length * 100).toFixed(1);
  console.log(`\nTotal UPC coverage: ${totalCoverage}/${allSupplies.length} (${percentage}%)`);

  console.log('\nFiles saved:');
  console.log('  - scripts/upc_matches.json');
  console.log('  - scripts/unmatched_supplies.json');

  if (matches.length > 0) {
    console.log('\n=== SAMPLE MATCHES ===');
    for (const match of matches.slice(0, 15)) {
      console.log(`[${match.matchMethod}] "${match.supplyName}"`);
      console.log(`  -> UPC: ${match.matchedUpc} | "${match.catalogName}" (${match.confidence.toFixed(2)})`);
    }
  }
}

matchUpcsToSupplies().catch(console.error);
