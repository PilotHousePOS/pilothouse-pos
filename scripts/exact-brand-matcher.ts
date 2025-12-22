import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, or, ilike, eq } from 'drizzle-orm';
import { expandAbbreviations } from '../server/abbreviationExpansion';

interface UpcCatalogEntry {
  upc: string;
  names: string[];
  primaryName: string;
}

interface UpcCatalog {
  entries: UpcCatalogEntry[];
}

interface ExactMatch {
  supplyId: number;
  supplyName: string;
  catalogName: string;
  expandedCatalog: string;
  upc: string;
  matchType: string;
  confidence: number;
}

// Normalize size: "15#" -> "15lb", "4.5#" -> "4.5lb"
function normalizeSize(str: string): string {
  return str.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb')
            .replace(/(\d+(?:\.\d+)?)\s*lbs/gi, '$1lb');
}

// Extract all tokens and their normalized forms
function extractTokens(name: string): Set<string> {
  const expanded = expandAbbreviations(normalizeSize(name));
  const tokens = new Set<string>();
  
  // Split into tokens
  const parts = expanded.toLowerCase()
    .replace(/[^a-z0-9.]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2);
  
  for (const p of parts) {
    tokens.add(p);
  }
  
  return tokens;
}

// Extract size with unit
function extractSize(name: string): string | null {
  const normalized = normalizeSize(name);
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(lb|oz|kg)/i);
  if (match) {
    return `${parseFloat(match[1])}${match[2].toLowerCase()}`;
  }
  return null;
}

// Key product descriptors that MUST match for high confidence
function extractKeyDescriptors(name: string): Set<string> {
  const expanded = expandAbbreviations(normalizeSize(name)).toLowerCase();
  const keys = new Set<string>();
  
  // Life stages
  if (/\bpuppy\b/.test(expanded)) keys.add('puppy');
  if (/\bkitten\b/.test(expanded)) keys.add('kitten');
  if (/\bsenior\b|\b7\+\b/.test(expanded)) keys.add('senior');
  if (/\badult\b/.test(expanded)) keys.add('adult');
  
  // Diet types
  if (/\bsensitive\b/.test(expanded)) keys.add('sensitive');
  if (/\bgrain free\b|\bgrain\s*fr\b/.test(expanded)) keys.add('grainfree');
  if (/\bweight\b/.test(expanded)) keys.add('weight');
  if (/\bperfect\b/.test(expanded)) keys.add('perfect');
  if (/\bwilderness\b/.test(expanded)) keys.add('wilderness');
  if (/\bfreedom\b/.test(expanded)) keys.add('freedom');
  if (/\bbasics?\b/.test(expanded)) keys.add('basics');
  
  // Breed sizes
  if (/\bsmall breed\b|\bsm\s*br\b/.test(expanded)) keys.add('smallbreed');
  if (/\blarge breed\b|\blg\s*br\b/.test(expanded)) keys.add('largebreed');
  if (/\bmini\b/.test(expanded)) keys.add('mini');
  
  // Proteins
  if (/\bchicken\b/.test(expanded)) keys.add('chicken');
  if (/\blamb\b/.test(expanded)) keys.add('lamb');
  if (/\bsalmon\b/.test(expanded)) keys.add('salmon');
  if (/\bbeef\b/.test(expanded)) keys.add('beef');
  if (/\bturkey\b/.test(expanded)) keys.add('turkey');
  if (/\bfish\b/.test(expanded)) keys.add('fish');
  if (/\bduck\b/.test(expanded)) keys.add('duck');
  
  // Product lines
  if (/\bhairball\b/.test(expanded)) keys.add('hairball');
  if (/\burinary\b/.test(expanded)) keys.add('urinary');
  if (/\bmobility\b/.test(expanded)) keys.add('mobility');
  if (/\bdigestive?\b/.test(expanded)) keys.add('digestive');
  
  return keys;
}

// Calculate match score based on key descriptors and size
function calculateMatchScore(
  supplyName: string, 
  catalogName: string
): { score: number; matchType: string; details: string } {
  const supplySize = extractSize(supplyName);
  const catalogSize = extractSize(catalogName);
  
  const supplyKeys = extractKeyDescriptors(supplyName);
  const catalogKeys = extractKeyDescriptors(catalogName);
  
  // Size must match if both have sizes (with tolerance for close matches)
  if (supplySize && catalogSize) {
    const supplyNum = parseFloat(supplySize);
    const catalogNum = parseFloat(catalogSize);
    const supplyUnit = supplySize.replace(/[\d.]/g, '');
    const catalogUnit = catalogSize.replace(/[\d.]/g, '');
    
    // Units must match
    if (supplyUnit !== catalogUnit) {
      return { score: 0, matchType: 'unit_mismatch', details: `${supplySize} vs ${catalogSize}` };
    }
    
    // Allow 10% tolerance for size
    const ratio = supplyNum / catalogNum;
    if (ratio < 0.9 || ratio > 1.1) {
      return { score: 0, matchType: 'size_mismatch', details: `${supplySize} vs ${catalogSize}` };
    }
  }
  
  // Calculate key descriptor overlap
  let matches = 0;
  let mismatches = 0;
  const matchedKeys: string[] = [];
  const unmatchedSupply: string[] = [];
  const unmatchedCatalog: string[] = [];
  
  for (const k of supplyKeys) {
    if (catalogKeys.has(k)) {
      matches++;
      matchedKeys.push(k);
    } else {
      unmatchedSupply.push(k);
      mismatches++;
    }
  }
  
  for (const k of catalogKeys) {
    if (!supplyKeys.has(k)) {
      unmatchedCatalog.push(k);
      mismatches++;
    }
  }
  
  const totalKeys = supplyKeys.size + catalogKeys.size;
  if (totalKeys === 0) {
    return { score: 0.5, matchType: 'no_keys', details: 'no key descriptors' };
  }
  
  // Score: matched keys vs total unique keys
  const keyScore = matches / Math.max(supplyKeys.size, catalogKeys.size);
  
  // Perfect match on all keys + size = 100%
  if (keyScore === 1 && supplySize && catalogSize && supplySize === catalogSize) {
    return { 
      score: 1.0, 
      matchType: 'exact', 
      details: `keys: [${matchedKeys.join(', ')}], size: ${supplySize}` 
    };
  }
  
  // High match on keys with matching size = 95%
  if (keyScore >= 0.9 && supplySize && catalogSize) {
    return { 
      score: 0.95, 
      matchType: 'high_confidence', 
      details: `keys: [${matchedKeys.join(', ')}], size: ${supplySize}` 
    };
  }
  
  // Good match on keys = scaled by key score
  if (keyScore >= 0.7) {
    return { 
      score: 0.7 + (keyScore * 0.25), 
      matchType: 'good_match', 
      details: `matched: [${matchedKeys.join(', ')}], unmatched: [${[...unmatchedSupply, ...unmatchedCatalog].join(', ')}]` 
    };
  }
  
  return { 
    score: keyScore * 0.7, 
    matchType: 'partial', 
    details: `matched: [${matchedKeys.join(', ')}]` 
  };
}

async function findExactMatches() {
  console.log('=== EXACT BRAND MATCHER (v2) ===\n');
  console.log('Target brands: Science Diet, Fromm, Nutrisource, Blue Buffalo\n');

  // Load catalog
  const catalog: UpcCatalog = JSON.parse(fs.readFileSync('scripts/upc_catalog.json', 'utf-8'));
  console.log(`Catalog: ${catalog.entries.length} total UPCs`);

  // Build brand-specific catalog
  const brandCatalogs: Record<string, UpcCatalogEntry[]> = {
    'Science Diet': catalog.entries.filter(e => /^SD\s|science diet/i.test(e.primaryName)),
    'Fromm': catalog.entries.filter(e => /^FROMM\s/i.test(e.primaryName)),
    'Nutrisource': catalog.entries.filter(e => /^NUTRI|NTRISRC/i.test(e.primaryName)),
    'Blue Buffalo': catalog.entries.filter(e => /^BLUE\s*B/i.test(e.primaryName))
  };

  console.log('\nCatalog entries by brand:');
  for (const [brand, entries] of Object.entries(brandCatalogs)) {
    console.log(`  ${brand}: ${entries.length} UPCs`);
  }

  // Get supplies needing UPC
  const allSupplies = await db.select().from(supplies).where(
    or(
      ilike(supplies.name, '%Science Diet%'),
      ilike(supplies.name, '%Fromm%'),
      ilike(supplies.name, '%Nutrisource%'),
      ilike(supplies.name, '%Blue Buffalo%'),
      ilike(supplies.brand, '%Science Diet%'),
      ilike(supplies.brand, '%Fromm%'),
      ilike(supplies.brand, '%Nutrisource%'),
      ilike(supplies.brand, '%Blue Buffalo%')
    )
  );

  const needsUpc = allSupplies.filter(s => !s.sku || s.sku.trim() === '');
  console.log(`\nSupplies needing UPC: ${needsUpc.length}`);

  const exactMatches: ExactMatch[] = [];
  const highConfMatches: ExactMatch[] = [];
  const mediumMatches: ExactMatch[] = [];

  for (const supply of needsUpc) {
    const supplyExpanded = expandAbbreviations(supply.name);
    
    // Determine which catalog to search
    let searchCatalog: UpcCatalogEntry[] = [];
    let brand = '';
    if (/science diet/i.test(supplyExpanded)) {
      searchCatalog = brandCatalogs['Science Diet'];
      brand = 'Science Diet';
    } else if (/fromm/i.test(supplyExpanded)) {
      searchCatalog = brandCatalogs['Fromm'];
      brand = 'Fromm';
    } else if (/nutrisource/i.test(supplyExpanded)) {
      searchCatalog = brandCatalogs['Nutrisource'];
      brand = 'Nutrisource';
    } else if (/blue buffalo/i.test(supplyExpanded)) {
      searchCatalog = brandCatalogs['Blue Buffalo'];
      brand = 'Blue Buffalo';
    }

    if (searchCatalog.length === 0) continue;

    let bestMatch: { entry: UpcCatalogEntry; score: number; matchType: string; details: string } | null = null;

    for (const entry of searchCatalog) {
      const result = calculateMatchScore(supply.name, entry.primaryName);
      
      if (result.score > 0 && (!bestMatch || result.score > bestMatch.score)) {
        bestMatch = { entry, ...result };
      }
    }

    if (bestMatch && bestMatch.score >= 0.7) {
      const match: ExactMatch = {
        supplyId: supply.id,
        supplyName: supply.name,
        catalogName: bestMatch.entry.primaryName,
        expandedCatalog: expandAbbreviations(normalizeSize(bestMatch.entry.primaryName)),
        upc: bestMatch.entry.upc,
        matchType: bestMatch.matchType + ' | ' + bestMatch.details,
        confidence: bestMatch.score
      };

      if (bestMatch.score >= 0.95) {
        exactMatches.push(match);
      } else if (bestMatch.score >= 0.85) {
        highConfMatches.push(match);
      } else {
        mediumMatches.push(match);
      }
    }
  }

  console.log('\n=== RESULTS ===');
  console.log(`100% Confidence (95%+): ${exactMatches.length}`);
  console.log(`High Confidence (85-95%): ${highConfMatches.length}`);
  console.log(`Medium Confidence (70-85%): ${mediumMatches.length}`);
  console.log(`Total safe matches: ${exactMatches.length + highConfMatches.length}`);

  // Save matches
  fs.writeFileSync('scripts/exact_brand_matches.json', JSON.stringify(exactMatches, null, 2));
  fs.writeFileSync('scripts/high_conf_brand_matches.json', JSON.stringify(highConfMatches, null, 2));
  fs.writeFileSync('scripts/all_brand_matches.json', JSON.stringify({
    exact: exactMatches,
    highConf: highConfMatches,
    medium: mediumMatches
  }, null, 2));

  console.log('\nSaved to scripts/exact_brand_matches.json and scripts/high_conf_brand_matches.json');

  console.log('\n=== 100% CONFIDENCE MATCHES ===');
  for (const m of exactMatches) {
    console.log(`[${(m.confidence*100).toFixed(0)}%] "${m.supplyName}"`);
    console.log(`    -> "${m.catalogName}" => "${m.expandedCatalog}"`);
    console.log(`    ${m.matchType} | UPC: ${m.upc}`);
  }

  if (highConfMatches.length > 0) {
    console.log('\n=== HIGH CONFIDENCE (85-95%) ===');
    for (const m of highConfMatches) {
      console.log(`[${(m.confidence*100).toFixed(0)}%] "${m.supplyName}"`);
      console.log(`    -> "${m.expandedCatalog}" | UPC: ${m.upc}`);
    }
  }

  if (mediumMatches.length > 0) {
    console.log('\n=== MEDIUM CONFIDENCE (70-85%) - for review ===');
    for (const m of mediumMatches.slice(0, 20)) {
      console.log(`[${(m.confidence*100).toFixed(0)}%] "${m.supplyName}"`);
      console.log(`    -> "${m.expandedCatalog}" | ${m.matchType}`);
    }
  }

  // Apply exact + high conf matches if --apply flag
  const toApply = [...exactMatches, ...highConfMatches];
  if (process.argv.includes('--apply') && toApply.length > 0) {
    console.log('\n=== APPLYING MATCHES ===');
    let applied = 0;
    for (const m of toApply) {
      try {
        await db.update(supplies)
          .set({ sku: m.upc })
          .where(eq(supplies.id, m.supplyId));
        applied++;
        console.log(`Applied: ${m.supplyName} -> ${m.upc}`);
      } catch (e) {
        console.error(`Error applying ${m.supplyId}:`, e);
      }
    }
    console.log(`\nTotal applied: ${applied}`);
  } else if (toApply.length > 0) {
    console.log('\nRun with --apply to apply these matches');
  }
}

findExactMatches().catch(console.error);
