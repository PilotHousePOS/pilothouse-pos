import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';

interface UpcRecord {
  upc: string;
  name: string;
  source: string;
}

const BRAND_ABBREVIATIONS: Record<string, string[]> = {
  'Science Diet': ['Sd', 'S/D', 'Science', 'Hills', 'Hill\'s'],
  'Natural Balance': ['Nb', 'N/B', 'Nat Bal', 'NatBal'],
  'Taste of the Wild': ['Tow', 'Toe', 'Totw', 'T.O.W.', 'Tastewild'],
  'Diamond': ['Diam', 'Dia'],
  'VICTOR': ['Vict', 'Vic', 'Victor'],
  'Eukanuba': ['Euk', 'Eukan'],
  'Zignature': ['Zig', 'Zign'],
  'Canidae': ['Cand', 'Canid'],
  'Nutrisource': ['Nutri', 'Ns', 'NutriSrc'],
  'Blue Buffalo': ['Bb', 'Blue', 'BlueBuf', 'Bluebuff'],
  'Pro Plan': ['Pp', 'Proplan', 'Pro Pln'],
  'Royal Canin': ['Rc', 'Royal', 'Roy Can', 'RoyCan'],
  'Purina': ['Pur', 'Purin'],
  'Fromm': ['Frm', 'Frmm'],
  'Acana': ['Acan'],
  'Orijen': ['Ori', 'Orij'],
  'Primal': ['Prim'],
  'Wellness': ['Well', 'Welln'],
  'Merrick': ['Merr', 'Mer'],
  'Stella & Chewy': ['S&C', 'Stella', 'Stell'],
  'Open Farm': ['Of', 'Opn Farm', 'OpnFarm'],
  'Farmina': ['Farm', 'Farmn'],
  'Nulo': ['Nul'],
  'Instinct': ['Inst', 'Instnct'],
  'ZooMed': ['Zoo', 'Zm', 'Zoo Med'],
  'Zoo Med': ['Zoo', 'Zm', 'ZooMed'],
  'Exo Terra': ['Exo', 'ExoTerra', 'Exotrr'],
  'Zilla': ['Zil', 'Zila'],
  'Hikari': ['Hik', 'Hikar'],
  'Tetra': ['Tet', 'Tetr'],
  'API': ['Api'],
  'Fluval': ['Flu', 'Fluv'],
  'Aqueon': ['Aq', 'Aquen'],
  'Penn-Plax': ['Pp', 'Penn', 'Pennplax', 'PennPlax'],
  'GloFish': ['Glo', 'Glof', 'Glofish'],
  'Marineland': ['Mar', 'Marine', 'Marinelnd'],
  'Kong': ['Kng', 'Knf'],
  'Nylabone': ['Nyl', 'Nyla', 'Nylab'],
  'TropiClean': ['Tropi', 'Trop', 'Tropicln'],
  'Coastal': ['Coast', 'Cstl', 'Cstl'],
  'Lupine': ['Lup', 'Lupn'],
  'ZippyPaws': ['Zip', 'Zippy', 'ZippyP'],
  'Prevue': ['Prev', 'Prevue Hendrix', 'Ph'],
  'Van Ness': ['Van', 'Vanness', 'Vn'],
  'Valhoma': ['Val', 'Valh'],
};

const WEIGHT_ABBREVIATIONS: Record<string, string[]> = {
  'lb': ['#', 'lbs', 'pound', 'pounds'],
  'oz': ['ounce', 'ounces'],
  'gal': ['g', 'gallon', 'gallons'],
  'qt': ['quart', 'quarts'],
};

const SIZE_ABBREVIATIONS: Record<string, string[]> = {
  'Small': ['Sm', 'S', 'Sml'],
  'Medium': ['Med', 'M', 'Md'],
  'Large': ['Lg', 'L', 'Lrg', 'Lge'],
  'Extra Large': ['Xl', 'Xlg', 'Xlrg', 'X-Large'],
  'Giant': ['Gnt', 'Gian'],
  'Mini': ['Min', 'Mn'],
};

function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(name: string): string[] {
  const normalized = normalizeForComparison(name);
  return normalized.split(' ').filter(w => w.length >= 2);
}

function expandAbbreviations(name: string): string {
  let expanded = name;
  
  for (const [full, abbrevs] of Object.entries(BRAND_ABBREVIATIONS)) {
    for (const abbrev of abbrevs) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  
  for (const [full, abbrevs] of Object.entries(SIZE_ABBREVIATIONS)) {
    for (const abbrev of abbrevs) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  
  expanded = expanded.replace(/(\d+)#/g, '$1lb');
  expanded = expanded.replace(/(\d+)\s*#/g, '$1lb');
  
  return expanded;
}

function extractWeightNumber(name: string): string | null {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(?:lb|#|oz|kg|gal|qt)/i);
  return match ? match[1] : null;
}

function calculateMatchScore(dbName: string, upcName: string, dbBrand: string | null): number {
  const expandedUpc = expandAbbreviations(upcName);
  
  const dbKeywords = extractKeywords(dbName);
  const upcKeywords = extractKeywords(expandedUpc);
  const upcOrigKeywords = extractKeywords(upcName);
  
  let score = 0;
  
  if (dbBrand) {
    const brandNorm = normalizeForComparison(dbBrand);
    const upcNorm = normalizeForComparison(expandedUpc);
    const upcOrigNorm = normalizeForComparison(upcName);
    
    if (upcNorm.includes(brandNorm) || upcOrigNorm.includes(brandNorm)) {
      score += 40;
    } else {
      const abbrevs = BRAND_ABBREVIATIONS[dbBrand];
      if (abbrevs) {
        for (const abbrev of abbrevs) {
          if (upcOrigNorm.includes(abbrev.toLowerCase())) {
            score += 35;
            break;
          }
        }
      }
    }
  }
  
  const matchingKeywords = dbKeywords.filter(kw => 
    upcKeywords.includes(kw) || upcOrigKeywords.includes(kw)
  );
  score += matchingKeywords.length * 8;
  
  const dbWeight = extractWeightNumber(dbName);
  const upcWeight = extractWeightNumber(upcName);
  if (dbWeight && upcWeight && dbWeight === upcWeight) {
    score += 20;
  }
  
  const totalKeywords = new Set([...dbKeywords, ...upcKeywords]).size;
  if (totalKeywords > 0) {
    const coverage = matchingKeywords.length / Math.max(dbKeywords.length, 1);
    score += Math.floor(coverage * 15);
  }
  
  return score;
}

async function matchUpcs() {
  console.log('Loading UPC data...');
  const upcData: UpcRecord[] = JSON.parse(fs.readFileSync('all_upcs.json', 'utf8'));
  console.log(`Loaded ${upcData.length} UPCs`);
  
  console.log('Loading products without SKU...');
  const productsWithoutSku = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Found ${productsWithoutSku.length} products without SKU`);
  
  const upcByName = new Map<string, UpcRecord>();
  for (const upc of upcData) {
    const normalizedName = normalizeForComparison(upc.name);
    if (!upcByName.has(normalizedName)) {
      upcByName.set(normalizedName, upc);
    }
  }
  
  const matches: { productId: number; productName: string; upc: string; upcName: string; score: number }[] = [];
  let exactMatches = 0;
  let fuzzyMatches = 0;
  
  for (const product of productsWithoutSku) {
    const normalizedProductName = normalizeForComparison(product.name);
    
    if (upcByName.has(normalizedProductName)) {
      const upc = upcByName.get(normalizedProductName)!;
      matches.push({
        productId: product.id,
        productName: product.name,
        upc: upc.upc,
        upcName: upc.name,
        score: 100
      });
      exactMatches++;
      continue;
    }
    
    let bestMatch: UpcRecord | null = null;
    let bestScore = 0;
    
    for (const upc of upcData) {
      const score = calculateMatchScore(product.name, upc.name, product.brand);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = upc;
      }
    }
    
    if (bestMatch && bestScore >= 50) {
      matches.push({
        productId: product.id,
        productName: product.name,
        upc: bestMatch.upc,
        upcName: bestMatch.name,
        score: bestScore
      });
      fuzzyMatches++;
    }
  }
  
  console.log(`\nFound ${matches.length} total matches:`);
  console.log(`  - Exact matches: ${exactMatches}`);
  console.log(`  - Fuzzy matches: ${fuzzyMatches}`);
  
  console.log('\nApplying matches to database...');
  let applied = 0;
  for (const match of matches) {
    try {
      await db.execute(sql`UPDATE supplies SET sku = ${match.upc} WHERE id = ${match.productId}`);
      applied++;
      if (applied % 100 === 0) {
        console.log(`  Applied ${applied}/${matches.length} matches`);
      }
    } catch (error) {
      console.error(`Failed to update product ${match.productId}:`, error);
    }
  }
  
  console.log(`\nApplied ${applied} new SKUs`);
  
  const allProducts = await db.select().from(supplies);
  const withSku = allProducts.filter(p => p.sku).length;
  console.log(`\nFinal coverage: ${withSku}/${allProducts.length} (${((withSku/allProducts.length)*100).toFixed(1)}%)`);
  
  const sampleUnmatched = productsWithoutSku
    .filter(p => !matches.find(m => m.productId === p.id))
    .slice(0, 20);
  
  console.log('\nSample unmatched products:');
  for (const p of sampleUnmatched) {
    console.log(`  - ${p.name} (${p.brand || 'no brand'})`);
  }
  
  process.exit(0);
}

matchUpcs().catch(console.error);
