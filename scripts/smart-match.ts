import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

interface UpcEntry {
  upc: string;
  name: string;
  source?: string;
}

// Comprehensive brand abbreviations
const brandAbbreviations: Record<string, string[]> = {
  'coastal': ['cstl', 'coast'],
  'penn-plax': ['pennplax', 'penn plax', 'pp'],
  'exo terra': ['exoterra', 'exo', 'et'],
  'zoo med': ['zoomed', 'zm'],
  'fluval': ['fluv'],
  'marineland': ['mland', 'marine'],
  'aqueon': ['aqn'],
  'kaytee': ['kt', 'kayt'],
  'zilla': ['zil'],
  'nylabone': ['nyla', 'nb'],
  'blue buffalo': ['bb', 'bluebuff', 'blue buff'],
  'science diet': ['sd', 'scidiet', 'sci diet', 'hills'],
  'royal canin': ['rc', 'royalcanin'],
  'purina': ['pur', 'purina pro'],
  'wellness': ['well', 'wlns'],
  'merrick': ['merr'],
  'nutro': ['nut'],
  'iams': ['iam'],
  "li'l pals": ['lil pals', 'lilpals', 'lp'],
  'valhoma': ['val', 'valh'],
  'sunburst': ['sunb', 'sb'],
  'lupine': ['lup'],
  'redbar': ['rb', 'redbarn'],
  'mammoth': ['mamm'],
  'oxbow': ['ox', 'oxb'],
  'spot': ['spt'],
};

// Product word abbreviations
const wordAbbreviations: Record<string, string[]> = {
  'collar': ['col', 'clr', 'coll'],
  'leash': ['lsh', 'leas'],
  'harness': ['harn', 'hrns'],
  'small': ['sm', 'sml'],
  'medium': ['med', 'md'],
  'large': ['lg', 'lrg'],
  'extra': ['x', 'xtra', 'ext'],
  'puppy': ['pup', 'ppy'],
  'adult': ['ad', 'adt', 'adlt'],
  'senior': ['sr', 'snr'],
  'chicken': ['ck', 'chk', 'chkn'],
  'beef': ['bf'],
  'lamb': ['lm', 'lmb'],
  'salmon': ['sal', 'slm', 'salmn'],
  'turkey': ['tk', 'trk', 'turk'],
  'food': ['fd', 'fod'],
  'treat': ['trt', 'trts'],
  'black': ['blk', 'bk'],
  'blue': ['blu', 'bl'],
  'red': ['rd'],
  'pink': ['pnk', 'pk'],
  'green': ['grn', 'gn'],
  'orange': ['org', 'orng'],
  'purple': ['pur', 'prp'],
  'white': ['wht', 'wt'],
  'brown': ['brn', 'brwn'],
  'inch': ['in', '"'],
  'foot': ['ft', "'"],
  'pound': ['lb', 'lbs', '#'],
  'ounce': ['oz'],
  'pack': ['pk', 'pck'],
  'filter': ['flt', 'fltr'],
  'light': ['lt', 'lgt'],
  'aquarium': ['aq', 'aquar'],
  'terrarium': ['terr'],
  'reptile': ['rept', 'rep'],
  'water': ['wtr', 'wat'],
  'dish': ['dsh'],
  'bowl': ['bwl'],
  'cave': ['cv'],
  'hide': ['hd'],
};

function normalizeText(text: string): string {
  return text.toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBrand(text: string): string | null {
  const normalized = normalizeText(text);
  
  for (const [brand, abbrs] of Object.entries(brandAbbreviations)) {
    if (normalized.startsWith(brand) || normalized.includes(` ${brand} `)) {
      return brand;
    }
    for (const abbr of abbrs) {
      if (normalized.startsWith(abbr + ' ') || normalized.includes(` ${abbr} `)) {
        return brand;
      }
    }
  }
  return null;
}

function expandAbbreviations(text: string): string {
  let result = normalizeText(text);
  
  // Expand word abbreviations
  for (const [full, abbrs] of Object.entries(wordAbbreviations)) {
    for (const abbr of abbrs) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      result = result.replace(regex, full);
    }
  }
  
  return result;
}

function getSignificantWords(text: string): Set<string> {
  const expanded = expandAbbreviations(text);
  const words = expanded.split(/\s+/).filter(w => w.length > 1);
  
  // Filter out common noise words
  const noise = new Set(['the', 'and', 'for', 'with', 'size', 'color', 'style']);
  return new Set(words.filter(w => !noise.has(w) && w.length > 1));
}

function calculateMatchScore(productWords: Set<string>, upcWords: Set<string>): { score: number; matchCount: number } {
  let matchCount = 0;
  
  for (const word of upcWords) {
    if (productWords.has(word)) {
      matchCount++;
    }
  }
  
  const score = upcWords.size > 0 ? matchCount / upcWords.size : 0;
  return { score, matchCount };
}

async function main() {
  console.log('=== Smart UPC Matching ===\n');
  
  // Load UPC database
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  console.log(`Loaded ${upcData.length} UPCs`);
  
  // Get products
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    category: supplies.category,
    sku: supplies.sku,
  }).from(supplies);
  
  // Track used UPCs (including by other products of same brand)
  const usedUpcs = new Map<string, { brand: string | null; id: number }>();
  for (const p of products) {
    if (p.sku && p.sku.length >= 10) {
      usedUpcs.set(p.sku, { brand: p.brand, id: p.id });
    }
  }
  
  console.log(`Products with UPC: ${usedUpcs.size}`);
  
  const needsUpc = products.filter(p => !p.sku || p.sku.length < 10);
  console.log(`Products needing UPC: ${needsUpc.length}`);
  
  // Build brand-indexed UPC database
  const upcByBrand = new Map<string, UpcEntry[]>();
  const upcNoBrand: UpcEntry[] = [];
  
  for (const entry of upcData) {
    const brand = extractBrand(entry.name);
    if (brand) {
      if (!upcByBrand.has(brand)) {
        upcByBrand.set(brand, []);
      }
      upcByBrand.get(brand)!.push(entry);
    } else {
      upcNoBrand.push(entry);
    }
  }
  
  console.log(`\nUPCs by brand:`);
  for (const [brand, entries] of Array.from(upcByBrand.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
    console.log(`  ${brand}: ${entries.length}`);
  }
  
  // Match products
  const matches: { productId: number; productName: string; productBrand: string | null; upc: string; upcName: string; score: number; matchCount: number }[] = [];
  const assignedUpcs = new Set<string>();
  
  for (const product of needsUpc) {
    const fullName = `${product.brand || ''} ${product.name}`.trim();
    const productBrand = (product.brand || '').toLowerCase().trim();
    const productWords = getSignificantWords(fullName);
    
    // First try brand-specific UPCs
    let candidates: UpcEntry[] = [];
    
    for (const [brand, entries] of upcByBrand) {
      if (productBrand.includes(brand) || brand.includes(productBrand.split(' ')[0])) {
        candidates.push(...entries);
      }
    }
    
    // Also try unbranded UPCs
    candidates.push(...upcNoBrand);
    
    let bestMatch: { upc: string; name: string; score: number; matchCount: number } | null = null;
    
    for (const entry of candidates) {
      // Skip already assigned (unless same brand - allow duplicates for variations)
      const existing = usedUpcs.get(entry.upc);
      if (existing && existing.brand?.toLowerCase() !== productBrand) {
        continue;
      }
      if (assignedUpcs.has(entry.upc)) {
        // Check if same brand
        const prevMatch = matches.find(m => m.upc === entry.upc);
        if (prevMatch && prevMatch.productBrand?.toLowerCase() !== productBrand) {
          continue;
        }
      }
      
      const upcWords = getSignificantWords(entry.name);
      const { score, matchCount } = calculateMatchScore(productWords, upcWords);
      
      // Require at least 3 matching words AND 70% match
      if (matchCount >= 3 && score >= 0.7) {
        if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && matchCount > bestMatch.matchCount)) {
          bestMatch = { upc: entry.upc, name: entry.name, score, matchCount };
        }
      }
    }
    
    if (bestMatch) {
      matches.push({
        productId: product.id,
        productName: fullName,
        productBrand: product.brand,
        upc: bestMatch.upc,
        upcName: bestMatch.name,
        score: bestMatch.score,
        matchCount: bestMatch.matchCount,
      });
      assignedUpcs.add(bestMatch.upc);
    }
  }
  
  console.log(`\nFound ${matches.length} matches`);
  
  // Apply matches
  let applied = 0;
  for (const match of matches) {
    try {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(sql`${supplies.id} = ${match.productId}`);
      applied++;
    } catch (e) {
      console.error(`Failed: ${match.productId}`);
    }
  }
  
  console.log(`Applied ${applied} UPCs`);
  
  // Save for review
  fs.writeFileSync('.local/state/memory/smart_matches.json', JSON.stringify(matches, null, 2));
  
  // Final stats
  const finalProducts = await db.select({
    id: supplies.id,
    sku: supplies.sku,
    brand: supplies.brand,
  }).from(supplies);
  
  const finalWithUpc = finalProducts.filter(p => p.sku && p.sku.length >= 10);
  
  // Count duplicates
  const skuBrands = new Map<string, Set<string>>();
  for (const p of finalProducts) {
    if (p.sku && p.sku.length >= 10) {
      if (!skuBrands.has(p.sku)) {
        skuBrands.set(p.sku, new Set());
      }
      skuBrands.get(p.sku)!.add((p.brand || '').toLowerCase());
    }
  }
  
  const crossBrandDupes = Array.from(skuBrands.entries()).filter(([_, brands]) => brands.size > 1).length;
  const sameBrandDupes = Array.from(skuBrands.entries()).filter(([_, brands]) => brands.size === 1).length - 
    finalProducts.filter(p => p.sku && p.sku.length >= 10).length + skuBrands.size;
  
  console.log(`\n=== Final Results ===`);
  console.log(`Products with UPC: ${finalWithUpc.length} / ${finalProducts.length} (${(finalWithUpc.length / finalProducts.length * 100).toFixed(1)}%)`);
  console.log(`Cross-brand duplicates (errors): ${crossBrandDupes}`);
}

main().catch(console.error);
