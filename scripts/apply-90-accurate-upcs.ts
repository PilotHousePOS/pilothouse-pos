import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import { abbreviationMappings } from './shared-mappings';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

const masterUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
console.log(`Loaded ${masterUpcs.length} UPCs from master list`);

function normalizeForMatching(text: string): string {
  if (!text) return '';
  let normalized = text.toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  for (const [abbr, full] of Object.entries(abbreviationMappings)) {
    const regex = new RegExp(`\\b${abbr.toLowerCase()}\\b`, 'gi');
    normalized = normalized.replace(regex, full.toLowerCase());
  }
  
  return normalized;
}

function getSignificantWords(text: string): Set<string> {
  const normalized = normalizeForMatching(text);
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'with', 'in', 'on', 'to', 'of', 'is']);
  const sizeWords = new Set(['sm', 'md', 'lg', 'xl', 'xs', 'xxl', 'small', 'medium', 'large']);
  
  const words = normalized.split(/\s+/)
    .filter(w => w.length >= 2)
    .filter(w => !stopWords.has(w))
    .filter(w => !/^\d+$/.test(w));
  
  return new Set(words);
}

function extractBrand(text: string): string {
  const normalized = normalizeForMatching(text);
  const brands = [
    'blue buffalo', 'science diet', 'royal canin', 'purina pro plan', 'iams', 'eukanuba',
    'wellness', 'nutro', 'hills', 'merrick', 'orijen', 'acana', 'taste of the wild',
    'coastal', 'kong', 'nylabone', 'petmate', 'zoo med', 'exo terra', 'zilla', 'fluval',
    'tetra', 'api', 'seachem', 'marineland', 'aqueon', 'hikari', 'penn plax', 'oxbow',
    'kaytee', 'living world', 'vittle vault', 'aspen', 'prevue', 'ware', 'superpet',
    'lupine', 'li l pals', 'lil pals', 'flexi', 'petsafe', 'kurgo', 'ruffwear',
    'natures miracle', 'simple solution', 'furminator', 'fresh n clean', 'tropiclean',
    'earthbath', 'burt bees', 'zymox', 'vet kem', 'adams', 'advantage', 'frontline',
    'seresto', 'bayer', 'elanco', 'nexgard', 'heartgard', 'trifexis', 'simparica',
    'greenies', 'whimzees', 'virbac', 'oravet', 'pedigree', 'cesar', 'beneful',
    'friskies', 'fancy feast', 'sheba', 'meow mix', 'kit n kaboodle', 'temptations',
    'whiskas', 'delectables', 'tiki cat', 'weruva', 'natural balance', 'canidae',
    'fromm', 'zignature', 'nulo', 'instinct', 'stella chewy', 'primal', 'northwest naturals',
    'answers', 'darwin', 'raw paws', 'smallbatch', 'tuckers', 'vital essentials',
    'nature variety', 'k9 natural', 'ziwi peak', 'boss', 'super bite', 'redbarn',
    'cadet', 'best bully sticks', 'barkworthies', 'nature gnaws', 'bones chews',
    'pawstruck', 'downtown pet supply', 'jack pup', 'sancho lola', 'hotspot pets',
    'ims trading', 'loving pets', 'pet factory', 'lennox', 'smokehouse', 'jones natural',
    'natural farm', 'k9 warehouse', 'buckley', 'scout bella', 'the honest kitchen',
    'open farm', 'spot farms', 'freshpet', 'just food for dogs', 'nom nom', 'ollie',
    'farmer dog', 'sunday', 'maev', 'jinx', 'wild earth', 'petaluma', 'bramble',
    'virchew', 'v dog', 'halo', 'evolution diet', 'ami', 'benevo', 'gather', 'petcurean'
  ];
  
  for (const brand of brands) {
    if (normalized.includes(brand)) {
      return brand;
    }
  }
  
  const firstWord = normalized.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 3) {
    return firstWord;
  }
  
  return '';
}

function extractSize(text: string): string {
  const normalized = text.toLowerCase();
  
  const sizePatterns = [
    /(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)/i,
    /(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)/i,
    /(\d+(?:\.\d+)?)\s*(?:kg|kilogram)/i,
    /(\d+(?:\.\d+)?)\s*(?:g|gram|grams)(?!\w)/i,
    /(\d+(?:\.\d+)?)\s*(?:ct|count|pk|pack)/i,
    /(\d+(?:\.\d+)?)\s*(?:ml|l|gal|gallon)/i,
    /(\d+)\s*x\s*(\d+)/i,
    /(\d+)\s*(?:in|inch|inches|ft|foot|feet)/i,
  ];
  
  for (const pattern of sizePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  return '';
}

function calculateMatchScore(dbProduct: string, upcName: string): number {
  const dbNormalized = normalizeForMatching(dbProduct);
  const upcNormalized = normalizeForMatching(upcName);
  
  if (dbNormalized === upcNormalized) {
    return 100;
  }
  
  const dbWords = getSignificantWords(dbProduct);
  const upcWords = getSignificantWords(upcName);
  
  if (dbWords.size === 0 || upcWords.size === 0) {
    return 0;
  }
  
  let matchingWords = 0;
  for (const word of dbWords) {
    if (upcWords.has(word)) {
      matchingWords++;
    }
  }
  
  const dbCoverage = matchingWords / dbWords.size;
  const upcCoverage = matchingWords / upcWords.size;
  
  let score = Math.min(dbCoverage, upcCoverage) * 100;
  
  const dbBrand = extractBrand(dbProduct);
  const upcBrand = extractBrand(upcName);
  
  if (dbBrand && upcBrand) {
    if (dbBrand === upcBrand) {
      score = Math.min(100, score + 10);
    } else {
      score = Math.max(0, score - 30);
    }
  }
  
  const dbSize = extractSize(dbProduct);
  const upcSize = extractSize(upcName);
  
  if (dbSize && upcSize) {
    if (dbSize === upcSize) {
      score = Math.min(100, score + 5);
    } else {
      score = Math.max(0, score - 15);
    }
  }
  
  if (dbCoverage >= 0.9 && upcCoverage >= 0.8) {
    score = Math.min(100, score + 5);
  }
  
  if (matchingWords >= 4 && dbCoverage >= 0.8) {
    score = Math.min(100, score + 5);
  }
  
  return Math.round(score);
}

function findBestMatch(dbName: string, upcs: UpcEntry[]): { upc: string; name: string; score: number } | null {
  let bestMatch: { upc: string; name: string; score: number } | null = null;
  
  for (const upcEntry of upcs) {
    const score = calculateMatchScore(dbName, upcEntry.name);
    
    if (score >= 90 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { upc: upcEntry.upc, name: upcEntry.name, score };
    }
  }
  
  return bestMatch;
}

async function main() {
  console.log('Loading products from database...');
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku
  }).from(supplies);
  
  console.log(`Loaded ${products.length} products`);
  
  const productsWithoutSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Products without SKU: ${productsWithoutSku.length}`);
  
  const upcByBrand: Map<string, UpcEntry[]> = new Map();
  for (const upc of masterUpcs) {
    const brand = extractBrand(upc.name);
    if (!upcByBrand.has(brand)) {
      upcByBrand.set(brand, []);
    }
    upcByBrand.get(brand)!.push(upc);
  }
  
  const matches: { id: number; name: string; upc: string; upcName: string; score: number }[] = [];
  const noMatch: { id: number; name: string }[] = [];
  
  let processed = 0;
  
  for (const product of productsWithoutSku) {
    processed++;
    if (processed % 500 === 0) {
      console.log(`Processed ${processed}/${productsWithoutSku.length}...`);
    }
    
    const productBrand = extractBrand(product.name);
    let candidateUpcs = upcByBrand.get(productBrand) || [];
    
    if (candidateUpcs.length === 0) {
      candidateUpcs = masterUpcs;
    }
    
    const bestMatch = findBestMatch(product.name, candidateUpcs);
    
    if (!bestMatch && candidateUpcs !== masterUpcs) {
      const fullMatch = findBestMatch(product.name, masterUpcs);
      if (fullMatch) {
        matches.push({
          id: product.id,
          name: product.name,
          upc: fullMatch.upc,
          upcName: fullMatch.name,
          score: fullMatch.score
        });
        continue;
      }
    }
    
    if (bestMatch) {
      matches.push({
        id: product.id,
        name: product.name,
        upc: bestMatch.upc,
        upcName: bestMatch.name,
        score: bestMatch.score
      });
    } else {
      noMatch.push({ id: product.id, name: product.name });
    }
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Total products without SKU: ${productsWithoutSku.length}`);
  console.log(`Matched (90%+): ${matches.length}`);
  console.log(`No match: ${noMatch.length}`);
  console.log(`Match rate: ${((matches.length / productsWithoutSku.length) * 100).toFixed(1)}%`);
  
  console.log('\nSample matches:');
  const sampleMatches = matches.slice(0, 10);
  for (const match of sampleMatches) {
    console.log(`  [${match.score}%] "${match.name}" => "${match.upcName}" (${match.upc})`);
  }
  
  console.log('\nApplying matches to database...');
  
  let applied = 0;
  for (const match of matches) {
    await db.update(supplies)
      .set({ sku: match.upc })
      .where(eq(supplies.id, match.id));
    applied++;
    
    if (applied % 200 === 0) {
      console.log(`Applied ${applied}/${matches.length}...`);
    }
  }
  
  console.log(`\nApplied ${applied} UPCs to products`);
  
  fs.writeFileSync('scripts/unmatched_90_accuracy.json', JSON.stringify(noMatch, null, 2));
  console.log(`Saved ${noMatch.length} unmatched products to scripts/unmatched_90_accuracy.json`);
  
  const finalStats = await db.select({
    total: supplies.id,
    withSku: supplies.sku
  }).from(supplies);
  
  const withSkuCount = finalStats.filter(p => p.withSku && p.withSku.trim() !== '').length;
  console.log(`\nFinal coverage: ${withSkuCount}/${finalStats.length} (${((withSkuCount / finalStats.length) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
