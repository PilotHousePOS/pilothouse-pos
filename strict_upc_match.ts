import { db } from './server/db';
import { supplies } from './shared/schema';
import { eq, isNull, and } from 'drizzle-orm';
import * as fs from 'fs';

interface SourceProduct {
  upc: string;
  name: string;
  type: string;
  price: number;
}

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(name: string): Set<string> {
  return new Set(normalizeForMatch(name).split(' ').filter(t => t.length > 1));
}

function calculateSimilarity(name1: string, name2: string): number {
  const tokens1 = tokenize(name1);
  const tokens2 = tokenize(name2);
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  let matches = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) matches++;
  }
  
  const jaccard = matches / (tokens1.size + tokens2.size - matches);
  return jaccard;
}

function extractBrand(name: string): string {
  const brands = [
    'zoomed', 'zoo med', 'exoterra', 'exo terra', 'fluker', 'zilla', 'repti',
    'hikari', 'tetra', 'aqueon', 'marineland', 'api', 'fluval', 'seachem',
    'penn plax', 'pennplax', 'cascade', 'glofish',
    'victor', 'diamond', 'taste of the wild', 'totw', 'blue buffalo', 'science diet',
    'royal canin', 'purina', 'pro plan', 'iams', 'pedigree', 'nutro', 'merrick',
    'wellness', 'natural balance', 'canidae', 'orijen', 'acana', 'fromm',
    'coastal', 'kong', 'nylabone', 'greenies', 'milk bone', 'blue', 'friskies',
    'fancy feast', 'sheba', 'meow mix', 'temptations', '9 lives', 'whiskas',
    'kaytee', 'oxbow', 'small world', 'living world', 'vitakraft',
    'furminator', 'earthbath', 'tropiclean', 'burt', 'nature', 'arm hammer'
  ];
  
  const normalized = name.toLowerCase();
  for (const brand of brands) {
    if (normalized.includes(brand)) {
      return brand;
    }
  }
  return '';
}

async function strictMatch() {
  console.log('Loading source UPCs...');
  const sourceProducts: SourceProduct[] = JSON.parse(fs.readFileSync('source_upcs.json', 'utf-8'));
  console.log(`Loaded ${sourceProducts.length} source products`);
  
  console.log('Loading database products...');
  const dbProducts = await db.select().from(supplies);
  console.log(`Found ${dbProducts.length} products in database`);
  
  const productsWithoutUpc = dbProducts.filter(p => !p.upc && !p.sku);
  console.log(`Products without UPC: ${productsWithoutUpc.length}`);
  
  // Track assigned UPCs to prevent duplicates
  const assignedUpcs = new Set(dbProducts.filter(p => p.upc).map(p => p.upc));
  const assignedSkus = new Set(dbProducts.filter(p => p.sku).map(p => p.sku));
  
  // Create source lookup by normalized name for exact matches
  const sourceByNormalizedName = new Map<string, SourceProduct>();
  for (const sp of sourceProducts) {
    const key = normalizeForMatch(sp.name);
    if (!sourceByNormalizedName.has(key)) {
      sourceByNormalizedName.set(key, sp);
    }
  }
  
  let exactMatches = 0;
  let highConfidenceMatches = 0;
  let updated = 0;
  
  for (const product of productsWithoutUpc) {
    const normalizedName = normalizeForMatch(product.name || '');
    const productBrand = extractBrand(product.name || '') || extractBrand(product.brand || '');
    
    // Try exact match first
    let match = sourceByNormalizedName.get(normalizedName);
    let matchType = 'exact';
    
    // If no exact match, try high-confidence fuzzy match
    if (!match) {
      let bestMatch: SourceProduct | null = null;
      let bestScore = 0;
      
      for (const sp of sourceProducts) {
        // Skip if UPC already assigned
        if (assignedUpcs.has(sp.upc) || assignedSkus.has(sp.upc)) continue;
        
        // Brand must match if both have brands
        const sourceBrand = extractBrand(sp.name);
        if (productBrand && sourceBrand && productBrand !== sourceBrand) continue;
        
        const similarity = calculateSimilarity(product.name || '', sp.name);
        
        if (similarity > bestScore && similarity >= 0.7) {
          bestScore = similarity;
          bestMatch = sp;
        }
      }
      
      if (bestMatch && bestScore >= 0.7) {
        match = bestMatch;
        matchType = `fuzzy(${(bestScore * 100).toFixed(0)}%)`;
      }
    }
    
    if (match && !assignedUpcs.has(match.upc) && !assignedSkus.has(match.upc) && product.id) {
      try {
        await db.update(supplies)
          .set({ upc: match.upc })
          .where(eq(supplies.id, product.id));
        
        assignedUpcs.add(match.upc);
      } catch (err) {
        console.error('Error updating product', product.id, product.name, ':', err);
        continue;
      }
      updated++;
      
      if (matchType === 'exact') exactMatches++;
      else highConfidenceMatches++;
      
      if (updated % 500 === 0) {
        console.log(`Updated ${updated} products...`);
      }
    }
  }
  
  console.log('\n=== Matching Complete ===');
  console.log(`Exact matches: ${exactMatches}`);
  console.log(`High-confidence fuzzy matches: ${highConfidenceMatches}`);
  console.log(`Total updated: ${updated}`);
  
  // Final verification
  const finalProducts = await db.select().from(supplies);
  const withUpc = finalProducts.filter(p => p.upc || p.sku);
  
  // Check for duplicates
  const upcCounts = new Map<string, number>();
  for (const p of finalProducts) {
    if (p.upc) {
      upcCounts.set(p.upc, (upcCounts.get(p.upc) || 0) + 1);
    }
  }
  const duplicates = [...upcCounts.entries()].filter(([_, count]) => count > 1);
  
  console.log(`\nFinal coverage: ${withUpc.length}/${finalProducts.length} (${((withUpc.length/finalProducts.length)*100).toFixed(1)}%)`);
  console.log(`Duplicate UPCs: ${duplicates.length}`);
}

strictMatch().then(() => {
  console.log('Done!');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
