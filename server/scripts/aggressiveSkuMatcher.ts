import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, isNull, ilike, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface Product {
  name: string;
  sku: string;
  source: string;
}

interface MatchResult {
  supplyId: number;
  supplyName: string;
  invoiceName: string;
  sku: string;
  confidence: number;
}

// Normalize and extract key tokens
function tokenize(text: string): string[] {
  return text
    .replace(/[™®©'"\-–—()]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
    .split(' ')
    .filter(w => w.length > 1)
    .filter(w => !['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'with', 'in', 'on', '-', 'up'].includes(w));
}

// Extract numbers from text (sizes, quantities)
function extractNumbers(text: string): string[] {
  const matches = text.match(/\d+(?:\.\d+)?/g) || [];
  return matches;
}

// Check if key product identifier matches
function keyIdentifierMatch(supply: string, invoice: string): boolean {
  const supplyTokens = tokenize(supply);
  const invoiceTokens = tokenize(invoice);
  
  // Check for product line numbers (Cascade 20, Cascade 300, etc.)
  const supplyNums = extractNumbers(supply);
  const invoiceNums = extractNumbers(invoice);
  
  // Find common significant numbers (filter out sizes like 2pk, 3oz)
  for (const num of supplyNums) {
    if (parseInt(num) >= 10 && invoiceNums.includes(num)) {
      return true;
    }
  }
  
  // Check for key product words
  const keyWords = ['heater', 'filter', 'pump', 'net', 'carbon', 'sponge', 'tank', 
                    'castle', 'treasure', 'driftwood', 'plant', 'bridge', 'cave',
                    'hammock', 'feeder', 'bowl', 'decoration', 'ornament', 'gravel',
                    'vac', 'thermometer', 'hygrometer', 'light', 'bulb', 'lamp'];
  
  for (const key of keyWords) {
    if (supplyTokens.includes(key) && invoiceTokens.includes(key)) {
      return true;
    }
  }
  
  return false;
}

// Calculate match score
function calculateScore(supplyName: string, invoiceName: string): number {
  const supplyTokens = new Set(tokenize(supplyName));
  const invoiceTokens = new Set(tokenize(invoiceName));
  
  if (supplyTokens.size === 0 || invoiceTokens.size === 0) return 0;
  
  // Count matching tokens
  let matches = 0;
  for (const token of supplyTokens) {
    if (invoiceTokens.has(token)) {
      matches++;
    } else {
      // Partial matches (substring)
      for (const invToken of invoiceTokens) {
        if (token.length >= 4 && invToken.includes(token)) {
          matches += 0.5;
          break;
        }
        if (invToken.length >= 4 && token.includes(invToken)) {
          matches += 0.5;
          break;
        }
      }
    }
  }
  
  // Score = matches / average of both sets
  const avgSize = (supplyTokens.size + invoiceTokens.size) / 2;
  let score = matches / avgSize;
  
  // Bonus for key identifier match
  if (keyIdentifierMatch(supplyName, invoiceName)) {
    score += 0.2;
  }
  
  // Number match bonus
  const supplyNums = extractNumbers(supplyName);
  const invoiceNums = extractNumbers(invoiceName);
  const numMatches = supplyNums.filter(n => invoiceNums.includes(n)).length;
  if (numMatches > 0) {
    score += 0.1 * numMatches;
  }
  
  return Math.min(score, 1.0);
}

// Product line matching patterns
const productPatterns: Array<{
  pattern: RegExp;
  invoicePattern: RegExp;
  skuPrefix?: string;
}> = [
  // Cascade filters
  { pattern: /cascade\s*(\d+)\s*(filter|hang)/i, invoicePattern: /cascade\s*(\d+).*(?:filter|hang)/i },
  { pattern: /cascade\s*bio\s*sponge/i, invoicePattern: /cascade.*bio.*sponge/i },
  { pattern: /cascade\s*filtapack/i, invoicePattern: /cascade.*filter.*pack|cascade.*replacement/i },
  
  // Penn-Plax products
  { pattern: /pro.?carb.*(\d+)/i, invoicePattern: /pro.?carb.*activated.*carbon/i },
  { pattern: /filter.?a.?carb/i, invoicePattern: /filter.?a.?carb/i },
  { pattern: /filter.?a.?brush/i, invoicePattern: /filter.*brush/i },
  
  // Decorations
  { pattern: /treasure\s*chest\s*(small|medium|large|sm|md|lg)/i, invoicePattern: /treasure.*chest/i },
  { pattern: /shipwreck\s*(small|medium|large|sm|md|lg)/i, invoicePattern: /shipwreck/i },
  { pattern: /driftwood\s*(small|medium|large|sm|md|lg)/i, invoicePattern: /driftwood/i },
  { pattern: /castle/i, invoicePattern: /castle/i },
  { pattern: /bridge/i, invoicePattern: /bridge/i },
  { pattern: /cave/i, invoicePattern: /cave/i },
  { pattern: /bonsai\s*tree/i, invoicePattern: /bonsai.*tree/i },
  
  // Characters
  { pattern: /spongebob|patrick|gary|squidward|chum\s*bucket/i, invoicePattern: /spongebob|patrick|gary|squidward|chum\s*bucket/i },
  { pattern: /nemo|dory|finding/i, invoicePattern: /nemo|dory|finding/i },
  { pattern: /jaws/i, invoicePattern: /jaws/i },
  { pattern: /star\s*wars/i, invoicePattern: /star\s*wars/i },
  { pattern: /hot\s*wheels/i, invoicePattern: /hot\s*wheels/i },
  { pattern: /barbie/i, invoicePattern: /barbie/i },
  { pattern: /paw\s*patrol/i, invoicePattern: /paw\s*patrol/i },
  { pattern: /frozen/i, invoicePattern: /frozen|anna|elsa/i },
  { pattern: /minion|kevin|stuart/i, invoicePattern: /minion|kevin|stuart/i },
  
  // Aquarium equipment
  { pattern: /gravel\s*vac/i, invoicePattern: /gravel.*vac/i },
  { pattern: /quick\s*net/i, invoicePattern: /quick.*net/i },
  { pattern: /air\s*stone/i, invoicePattern: /air.*stone/i },
  { pattern: /air\s*pump/i, invoicePattern: /air.*pump/i },
  { pattern: /wonder\s*shell/i, invoicePattern: /wonder\s*shell/i },
  { pattern: /wizard/i, invoicePattern: /wizard.*scrubber/i },
  
  // Plants
  { pattern: /aqua\s*plant|aquaplt/i, invoicePattern: /aqua.?plant/i },
  { pattern: /sinker/i, invoicePattern: /sinker/i },
  
  // Reptile
  { pattern: /reptology/i, invoicePattern: /reptology/i },
  { pattern: /lizard\s*lounger/i, invoicePattern: /lizard.*lounger/i },
  { pattern: /thermometer/i, invoicePattern: /thermometer/i },
  { pattern: /hygrometer/i, invoicePattern: /hygrometer/i },
  
  // Bird
  { pattern: /bird\s*life/i, invoicePattern: /bird\s*life/i },
  { pattern: /calcium\s*perch/i, invoicePattern: /calcium.*perch/i },
  
  // Cat
  { pattern: /cat\s*life/i, invoicePattern: /cat\s*life/i },
  
  // Small Animal
  { pattern: /small\s*animal\s*life/i, invoicePattern: /small\s*animal/i },
];

async function runAggressiveMatcher() {
  console.log('=== Aggressive SKU Matcher ===\n');
  
  // Load extracted products
  const productsJson = fs.readFileSync('/tmp/extracted_products.json', 'utf-8');
  const extractedProducts: Product[] = JSON.parse(productsJson);
  
  console.log(`Loaded ${extractedProducts.length} extracted products`);
  
  // Get supplies without SKU
  const suppliesWithoutSku = await db
    .select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Supplies without SKU: ${suppliesWithoutSku.length}\n`);
  
  const matches: MatchResult[] = [];
  const usedSkus = new Set<string>();
  
  // First pass: Pattern-based matching
  console.log('Pass 1: Pattern-based matching...');
  for (const supply of suppliesWithoutSku) {
    for (const { pattern, invoicePattern } of productPatterns) {
      if (!supply.name.match(pattern)) continue;
      
      // Find matching invoice product
      for (const prod of extractedProducts) {
        if (usedSkus.has(prod.sku)) continue;
        if (!prod.name.match(invoicePattern)) continue;
        
        const score = calculateScore(supply.name, prod.name);
        if (score >= 0.4) {
          matches.push({
            supplyId: supply.id,
            supplyName: supply.name,
            invoiceName: prod.name,
            sku: prod.sku,
            confidence: score
          });
          usedSkus.add(prod.sku);
          break;
        }
      }
    }
  }
  
  console.log(`Pattern matches: ${matches.length}`);
  
  // Second pass: Token-based matching for remaining supplies
  console.log('Pass 2: Token-based matching...');
  const matchedSupplyIds = new Set(matches.map(m => m.supplyId));
  
  for (const supply of suppliesWithoutSku) {
    if (matchedSupplyIds.has(supply.id)) continue;
    
    let bestMatch: MatchResult | null = null;
    let bestScore = 0;
    
    for (const prod of extractedProducts) {
      if (usedSkus.has(prod.sku)) continue;
      
      const score = calculateScore(supply.name, prod.name);
      if (score > bestScore && score >= 0.55) {
        bestScore = score;
        bestMatch = {
          supplyId: supply.id,
          supplyName: supply.name,
          invoiceName: prod.name,
          sku: prod.sku,
          confidence: score
        };
      }
    }
    
    if (bestMatch) {
      matches.push(bestMatch);
      usedSkus.add(bestMatch.sku);
    }
  }
  
  console.log(`Total matches: ${matches.length}`);
  
  // Sort by confidence
  matches.sort((a, b) => b.confidence - a.confidence);
  
  // Show matches
  console.log('\nTop matches:');
  for (const m of matches.slice(0, 50)) {
    console.log(`  [${m.confidence.toFixed(2)}] "${m.supplyName}" => "${m.invoiceName.substring(0, 50)}" (${m.sku})`);
  }
  
  // Apply matches with confidence >= 0.5
  const toApply = matches.filter(m => m.confidence >= 0.5);
  console.log(`\n\nApplying ${toApply.length} matches...`);
  
  let applied = 0;
  for (const match of toApply) {
    try {
      await db
        .update(supplies)
        .set({ sku: match.sku })
        .where(eq(supplies.id, match.supplyId));
      applied++;
    } catch (err) {
      // Ignore errors
    }
  }
  
  console.log(`Applied ${applied} SKU updates\n`);
  
  // Final stats
  const remainingWithoutSku = await db
    .select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  const totalWithSku = await db
    .select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(and(
      sql`${supplies.sku} IS NOT NULL`,
      sql`${supplies.sku} != ''`
    ));
  
  console.log('=== Final Statistics ===');
  console.log(`Supplies with SKU now: ${totalWithSku[0].count}`);
  console.log(`Supplies still without SKU: ${remainingWithoutSku[0].count}`);
  
  return { applied };
}

runAggressiveMatcher()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
