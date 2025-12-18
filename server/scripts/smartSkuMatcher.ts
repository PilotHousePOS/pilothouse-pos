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
  matchType: string;
}

// Normalize text for comparison
function normalize(text: string): string {
  return text
    .replace(/[™®©]/g, '')
    .replace(/[''""\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// Extract key terms from product name
function extractTerms(text: string): Set<string> {
  const normalized = normalize(text);
  const terms = normalized.split(' ').filter(w => w.length > 2);
  return new Set(terms);
}

// Calculate word overlap score
function wordOverlapScore(s1: string, s2: string): number {
  const terms1 = extractTerms(s1);
  const terms2 = extractTerms(s2);
  
  if (terms1.size === 0 || terms2.size === 0) return 0;
  
  let matchCount = 0;
  for (const term of terms1) {
    if (terms2.has(term)) {
      matchCount++;
    } else {
      // Partial match (one contains the other)
      for (const t2 of terms2) {
        if (term.includes(t2) || t2.includes(term)) {
          matchCount += 0.5;
          break;
        }
      }
    }
  }
  
  // Score based on matches vs total unique terms
  const totalUnique = new Set([...terms1, ...terms2]).size;
  return matchCount / totalUnique;
}

// Extract size/quantity from product name
function extractSize(text: string): string | null {
  const normalized = normalize(text);
  
  // Common size patterns
  const patterns = [
    /(\d+(?:\.\d+)?)\s*(oz|lb|lbs|gallon|gal|gph|ct|pk|pack|count|inch|in|ft|feet|watt|w)\b/i,
    /(\d+)\s*(?:piece|pc|pcs)\b/i,
    /\b(sm|small|md|medium|lg|large|xl|xxl)\b/i,
    /(\d+)\s*(?:x|×)\s*(\d+)/i,  // dimensions
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

// Check if sizes match
function sizesMatch(s1: string, s2: string): boolean {
  const size1 = extractSize(s1);
  const size2 = extractSize(s2);
  
  if (!size1 || !size2) return true; // No size to compare
  
  return normalize(size1) === normalize(size2);
}

// Extract brand from product name
function extractBrand(text: string): string | null {
  const normalized = normalize(text);
  
  const brands = [
    'penn plax', 'pennplax', 'cascade', 'reptology', 'shorefins',
    'tide treasure', 'tide & treasure', 'action air',
    'api', 'tetra', 'hikari', 'fluval', 'aqueon', 'marineland',
    'zoo med', 'zilla', 'exo terra', 'fluker', 'repti', 
    'omega one', 'seachem', 'fritz', 'carib sea', 'imagitarium',
    'top fin', 'aqua culture', 'glofish', 'spongebob', 'hot wheels',
    'barbie', 'paw patrol', 'frozen', 'marshall', 'oxbow', 'kaytee',
    'kong', 'nylabone', 'blue buffalo', 'wellness', 'royal canin',
    'purina', 'iams', 'science diet', 'pedigree', 'meow mix',
    'friskies', 'fancy feast', 'greenies', 'milk bone', 'beggin',
  ];
  
  for (const brand of brands) {
    if (normalized.includes(brand)) {
      return brand;
    }
  }
  return null;
}

// Check if brands match
function brandsMatch(s1: string, s2: string): boolean {
  const brand1 = extractBrand(s1);
  const brand2 = extractBrand(s2);
  
  if (!brand1 && !brand2) return true;
  if (!brand1 || !brand2) return false;
  
  return brand1 === brand2;
}

// Main matching function
async function runSmartMatcher() {
  console.log('=== Smart SKU Matcher ===\n');
  
  // Load extracted products
  const productsJson = fs.readFileSync('/tmp/extracted_products.json', 'utf-8');
  const extractedProducts: Product[] = JSON.parse(productsJson);
  
  console.log(`Loaded ${extractedProducts.length} extracted products`);
  
  // Build lookup maps
  const skuToProduct = new Map<string, Product>();
  const nameIndex = new Map<string, Product[]>(); // normalized words -> products
  
  for (const prod of extractedProducts) {
    skuToProduct.set(prod.sku, prod);
    
    // Index by key words
    const terms = extractTerms(prod.name);
    for (const term of terms) {
      if (!nameIndex.has(term)) {
        nameIndex.set(term, []);
      }
      nameIndex.get(term)!.push(prod);
    }
  }
  
  // Get supplies without SKU
  const suppliesWithoutSku = await db
    .select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Supplies without SKU: ${suppliesWithoutSku.length}\n`);
  
  const matches: MatchResult[] = [];
  
  for (const supply of suppliesWithoutSku) {
    const supplyTerms = extractTerms(supply.name);
    const supplyBrand = extractBrand(supply.name) || (supply.brand?.toLowerCase() || '');
    
    // Find candidate products that share terms
    const candidates = new Set<Product>();
    for (const term of supplyTerms) {
      const prods = nameIndex.get(term);
      if (prods) {
        for (const p of prods) {
          candidates.add(p);
        }
      }
    }
    
    let bestMatch: MatchResult | null = null;
    let bestScore = 0;
    
    for (const candidate of candidates) {
      // Calculate base word overlap score
      let score = wordOverlapScore(supply.name, candidate.name);
      
      // Brand bonus
      if (brandsMatch(supply.name, candidate.name) && extractBrand(supply.name)) {
        score += 0.15;
      }
      
      // Size penalty if mismatch
      if (!sizesMatch(supply.name, candidate.name)) {
        score -= 0.3;
      }
      
      // Penn-Plax source bonus (more reliable)
      if (candidate.source === 'penn-plax') {
        score += 0.05;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          supplyId: supply.id,
          supplyName: supply.name,
          invoiceName: candidate.name,
          sku: candidate.sku,
          confidence: score,
          matchType: candidate.source
        };
      }
    }
    
    if (bestMatch && bestMatch.confidence >= 0.5) {
      matches.push(bestMatch);
    }
  }
  
  // Sort by confidence
  matches.sort((a, b) => b.confidence - a.confidence);
  
  console.log(`Found ${matches.length} potential matches\n`);
  
  // Categorize matches
  const highConf = matches.filter(m => m.confidence >= 0.7);
  const medConf = matches.filter(m => m.confidence >= 0.55 && m.confidence < 0.7);
  const lowConf = matches.filter(m => m.confidence >= 0.5 && m.confidence < 0.55);
  
  console.log(`High confidence (>= 0.70): ${highConf.length}`);
  console.log(`Medium confidence (0.55-0.70): ${medConf.length}`);
  console.log(`Low confidence (0.50-0.55): ${lowConf.length}\n`);
  
  // Show high confidence matches
  console.log('High confidence matches:');
  for (const m of highConf.slice(0, 30)) {
    console.log(`  [${m.confidence.toFixed(2)}] "${m.supplyName.substring(0, 50)}" => "${m.invoiceName.substring(0, 50)}" (${m.sku})`);
  }
  
  // Apply high and medium confidence matches
  console.log('\n\nApplying high + medium confidence matches...');
  let applied = 0;
  
  for (const match of [...highConf, ...medConf]) {
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
  console.log(`Total matches applied: ${applied}`);
  console.log(`Supplies with SKU now: ${totalWithSku[0].count}`);
  console.log(`Supplies still without SKU: ${remainingWithoutSku[0].count}`);
  
  // Save low confidence matches for review
  fs.writeFileSync('/tmp/low_confidence_matches.json', JSON.stringify(lowConf, null, 2));
  console.log('\nLow confidence matches saved to /tmp/low_confidence_matches.json for review');
  
  return { applied };
}

runSmartMatcher()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
