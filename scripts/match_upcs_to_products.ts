import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql, isNull, or } from 'drizzle-orm';
import * as fs from 'fs';

// UPC prefix to brand mapping
const UPC_BRAND_MAP: Record<string, string> = {
  '015905': 'Aqueon',
  '317163': 'API',
  '042055': 'Hikari',
  '046798': 'Tetra',
  '071859': 'Kaytee',
  '035585': 'Kong',
  '096316': 'Zilla',
  '097612': 'Zoo Med',
  '091197': "Fluker's",
  '784369': 'Komodo',
  '000116': 'Seachem',
  '018214': 'Nylabone',
  '077234': 'Ethical',
  '642863': 'Greenies',
  '762177': 'ZuPreem',
  '618940': 'JW Pet',
  '720101': 'Kaytee',
  '015561': 'Fluval',
  '045663': 'Four Paws',
  '034846': 'Milpet',
  '746772': 'Mammoth',
  '019014': 'Iams',
  '645095': 'TropiClean',
  '723633': 'Natural Balance',
  '811794': 'Furminator',
  '029904': 'WorldWide Imports',
  '070271': 'Penn-Plax',
  '030172': 'Penn-Plax',
};

// Abbreviation expansions for invoice descriptions
const ABBREVIATIONS: Record<string, string> = {
  'CCHLD': 'CICHLID',
  'PLLT': 'PELLET',
  'CLNR': 'CLEANER',
  'GRVL': 'GRAVEL',
  'FXTR': 'FIXTURE',
  'COND': 'CONDITIONER',
  'ESNTL': 'ESSENTIAL',
  'FLK': 'FLAKE',
  'GLOFSH': 'GLOFISH',
  'ORNMT': 'ORNAMENT',
  'SBSTRT': 'SUBSTRATE',
  'TRT': 'TREAT',
  'SPLMT': 'SUPPLEMENT',
  'RMDY': 'REMEDY',
  'BEDNG': 'BEDDING',
  'BULB': 'BULB',
  'REFL': 'REFLECTOR',
  'CERM': 'CERAMIC',
  'TRPCL': 'TROPICAL',
  'WDLAND': 'WOODLAND',
  'RAINFORST': 'RAINFOREST',
  'SHMP': 'SHAMPOO',
  'DNTL': 'DENTAL',
  'BSCT': 'BISCUIT',
  'DSPNSR': 'DISPENSER',
  'VENISN': 'VENISON',
  'SWPOT': 'SWEET POTATO',
  'SLMN': 'SALMON',
  'HRMT': 'HERMIT',
  'WTR': 'WATER',
  'THERM': 'THERMOMETER',
  'HUMDTY': 'HUMIDITY',
  'PRRT': 'PARROT',
  'TIEL': 'COCKATIEL',
  'KEET': 'PARAKEET',
  'HNY': 'HONEY',
  'FDPH': 'FORTI-DIET PRO HEALTH',
  'SPRFD': 'SUPERFOOD',
  'BK': 'BLACK',
  'WH': 'WHITE',
  'MD': 'MEDIUM',
  'SM': 'SMALL',
  'LG': 'LARGE',
  'XL': 'EXTRA LARGE',
  'REG': 'REGULAR',
  'OZ': 'OZ',
  'QT': 'QT',
  'IN': 'IN',
};

function expandDescription(desc: string): string {
  let expanded = desc;
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    expanded = expanded.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  return expanded;
}

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(a: string, b: string): number {
  const aWords = new Set(normalizeForSearch(a).split(' ').filter(w => w.length > 2));
  const bWords = new Set(normalizeForSearch(b).split(' ').filter(w => w.length > 2));
  
  let matches = 0;
  for (const word of aWords) {
    if (bWords.has(word)) matches++;
  }
  
  const total = Math.max(aWords.size, bWords.size);
  return total > 0 ? matches / total : 0;
}

async function main() {
  // Load extracted UPCs
  const upcsData = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf8'));
  const upcs = Object.entries(upcsData) as [string, string][];
  
  console.log(`Loaded ${upcs.length} UPCs from invoices`);
  
  // Get all products without SKU
  const productsNoSku = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Found ${productsNoSku.length} products without SKU`);
  
  // Track matches
  const matches: Array<{upc: string, productId: number, productName: string, invoiceDesc: string, similarity: number}> = [];
  const unmatchedUpcs: Array<{upc: string, desc: string, brand: string | null}> = [];
  
  for (const [upc, rawDesc] of upcs) {
    const prefix = upc.substring(0, 6);
    const brand = UPC_BRAND_MAP[prefix];
    const expandedDesc = expandDescription(rawDesc);
    
    if (!brand) {
      unmatchedUpcs.push({ upc, desc: rawDesc, brand: null });
      continue;
    }
    
    // Filter products by brand
    const brandProducts = productsNoSku.filter(p => 
      p.brand?.toLowerCase() === brand.toLowerCase()
    );
    
    if (brandProducts.length === 0) {
      unmatchedUpcs.push({ upc, desc: rawDesc, brand });
      continue;
    }
    
    // Find best match
    let bestMatch = null;
    let bestScore = 0;
    
    for (const product of brandProducts) {
      const productText = `${product.name} ${product.description || ''}`;
      const score = calculateSimilarity(expandedDesc, productText);
      
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestMatch = product;
      }
    }
    
    if (bestMatch) {
      matches.push({
        upc,
        productId: bestMatch.id,
        productName: bestMatch.name,
        invoiceDesc: rawDesc,
        similarity: bestScore
      });
    } else {
      unmatchedUpcs.push({ upc, desc: rawDesc, brand });
    }
  }
  
  console.log(`\nMatched: ${matches.length}`);
  console.log(`Unmatched: ${unmatchedUpcs.length}`);
  
  // Sort matches by similarity (highest first)
  matches.sort((a, b) => b.similarity - a.similarity);
  
  // Save matches for review
  fs.writeFileSync('/tmp/upc_matches.json', JSON.stringify(matches, null, 2));
  fs.writeFileSync('/tmp/unmatched_upcs.json', JSON.stringify(unmatchedUpcs, null, 2));
  
  // Show sample matches
  console.log('\n=== Top 20 Matches ===');
  for (const match of matches.slice(0, 20)) {
    console.log(`UPC: ${match.upc} (${(match.similarity * 100).toFixed(0)}%)`);
    console.log(`  Invoice: ${match.invoiceDesc}`);
    console.log(`  Product: ${match.productName}`);
    console.log('');
  }
  
  // Show unmatched by brand
  const unmatchedByBrand: Record<string, number> = {};
  for (const item of unmatchedUpcs) {
    const key = item.brand || 'Unknown';
    unmatchedByBrand[key] = (unmatchedByBrand[key] || 0) + 1;
  }
  
  console.log('\n=== Unmatched by Brand ===');
  Object.entries(unmatchedByBrand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([brand, count]) => console.log(`  ${brand}: ${count}`));
  
  process.exit(0);
}

main().catch(console.error);
