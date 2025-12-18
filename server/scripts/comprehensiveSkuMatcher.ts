import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, isNull, ilike, or, sql } from 'drizzle-orm';
import * as fs from 'fs';

interface ExtractedProduct {
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

// Parse Penn-Plax style orders (Name, SKU, Price format)
function parsePennPlaxFormat(text: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Look for lines with 12-digit SKU starting with 030172
    const skuMatch = line.match(/030172\d{6}/);
    if (skuMatch) {
      // The product name is usually before the SKU on same line or previous lines
      const sku = skuMatch[0];
      
      // Try to extract name from the same line
      const beforeSku = line.substring(0, line.indexOf(sku)).trim();
      if (beforeSku.length > 3) {
        products.push({
          name: beforeSku,
          sku: sku,
          source: 'penn-plax'
        });
      } else {
        // Look at previous lines for the product name
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const prevLine = lines[j].trim();
          if (prevLine.length > 5 && !prevLine.match(/^\d+$/) && !prevLine.match(/^\$/) && !prevLine.match(/^030172/)) {
            products.push({
              name: prevLine,
              sku: sku,
              source: 'penn-plax'
            });
            break;
          }
        }
      }
    }
  }
  
  return products;
}

// Parse Central Pet Dallas format
function parseCentralPetFormat(text: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  
  // Central Pet format has UPCs in one column and descriptions in another
  // Pattern: product lines followed by UPC lines
  const upcPattern = /\b(\d{12,13})\b/g;
  const lines = text.split('\n');
  
  let currentProducts: string[] = [];
  let currentUpcs: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if line contains a UPC
    const upcMatches = trimmed.match(upcPattern);
    if (upcMatches) {
      currentUpcs.push(...upcMatches);
    }
    
    // Check if line looks like a product description (contains letters and typical abbreviations)
    if (trimmed.match(/^[A-Z]{2,4}\s+[A-Z]/)) {
      currentProducts.push(trimmed);
    }
  }
  
  // Try to correlate products and UPCs
  const productLines = text.match(/[A-Z]{2,4}\s+[A-Z][A-Z\s]+[A-Z0-9#.]+/g) || [];
  
  for (const prodLine of productLines) {
    // Try to find associated UPC nearby in the text
    const prodIndex = text.indexOf(prodLine);
    const nearbyText = text.substring(Math.max(0, prodIndex - 200), prodIndex + 200);
    const nearbyUpcs = nearbyText.match(/\b(\d{12,13})\b/g);
    
    if (nearbyUpcs && nearbyUpcs.length > 0) {
      products.push({
        name: prodLine,
        sku: nearbyUpcs[0],
        source: 'central-pet'
      });
    }
  }
  
  return products;
}

// Parse Phillips Pet format
function parsePhillipsPetFormat(text: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  
  // Phillips format often has item number, UPC, and description
  // Look for patterns like: ItemNum   UPC          Description
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Pattern: starts with numbers, has a UPC (10-13 digits), then product name
    const match = trimmed.match(/^\d+\s+(\d{10,13})\s+(.+)/);
    if (match) {
      products.push({
        name: match[2].trim(),
        sku: match[1],
        source: 'phillips'
      });
    }
    
    // Also look for lines with UPC followed by description
    const altMatch = trimmed.match(/(\d{10,13})\s+([A-Za-z].+)/);
    if (altMatch && altMatch[2].length > 5) {
      products.push({
        name: altMatch[2].trim(),
        sku: altMatch[1],
        source: 'phillips'
      });
    }
  }
  
  return products;
}

// Normalize text for comparison
function normalizeText(text: string): string {
  return text
    .replace(/[™®©]/g, '')
    .replace(/[''"]/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// Calculate similarity between two strings
function similarity(s1: string, s2: string): number {
  const n1 = normalizeText(s1);
  const n2 = normalizeText(s2);
  
  if (n1 === n2) return 1.0;
  
  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) {
    const shorter = n1.length < n2.length ? n1 : n2;
    const longer = n1.length >= n2.length ? n1 : n2;
    return shorter.length / longer.length;
  }
  
  // Word overlap scoring
  const words1 = new Set(n1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(n2.split(' ').filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  
  return intersection.length / union.size;
}

// Brand-specific patterns for common abbreviations
const brandPatterns: Record<string, RegExp> = {
  'API': /^API\s+/i,
  'Tetra': /^TET\s+|^TETRA\s+/i,
  'Hikari': /^HIK\s+|^HIKARI\s+/i,
  'Fluker': /^FLU\s+|^FLUKER/i,
  'ZooMed': /^ZOO\s*MED|^ZM\s+/i,
  'Aqueon': /^AQE\s+|^AQUEON/i,
  'Marineland': /^MAR\s+|^MARINELAND/i,
  'Penn-Plax': /^030172|PENN.?PLAX/i,
  'ExoTerra': /^EXO\s*TERRA|^ET\s+/i,
  'Omega One': /^OMEGA\s+ONE|^OMG\s+/i,
  'SeaChem': /^SEACHEM|^SEC\s+/i,
};

// Extract products from all invoice text
function extractAllProducts(text: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  
  // Parse different formats
  products.push(...parsePennPlaxFormat(text));
  products.push(...parseCentralPetFormat(text));
  products.push(...parsePhillipsPetFormat(text));
  
  // Additional pattern: Direct name-SKU pairs (common in many formats)
  const directPattern = /([A-Za-z][A-Za-z\s\-']+[A-Za-z])\s+(\d{10,14})/g;
  let match;
  while ((match = directPattern.exec(text)) !== null) {
    if (match[1].length > 5) {
      products.push({
        name: match[1].trim(),
        sku: match[2],
        source: 'direct'
      });
    }
  }
  
  // Deduplicate by SKU
  const seen = new Map<string, ExtractedProduct>();
  for (const prod of products) {
    if (!seen.has(prod.sku) || prod.name.length > (seen.get(prod.sku)?.name.length || 0)) {
      seen.set(prod.sku, prod);
    }
  }
  
  return Array.from(seen.values());
}

async function runComprehensiveMatch() {
  console.log('=== Comprehensive SKU Matching System ===\n');
  
  // Load all extracted invoice text
  const allInvoiceText = fs.readFileSync('/tmp/all_invoice_text.txt', 'utf-8');
  const pennPlaxText = fs.existsSync('/tmp/penn_plax_combined.txt') 
    ? fs.readFileSync('/tmp/penn_plax_combined.txt', 'utf-8') 
    : '';
  
  // Combine all text
  const combinedText = allInvoiceText + '\n' + pennPlaxText;
  
  console.log(`Total invoice text: ${combinedText.length} characters`);
  
  // Extract all products
  const extractedProducts = extractAllProducts(combinedText);
  console.log(`Extracted ${extractedProducts.length} unique products with SKUs from invoices\n`);
  
  // Get all supplies missing SKUs
  const suppliesWithoutSku = await db
    .select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`Supplies without SKU: ${suppliesWithoutSku.length}\n`);
  
  const matches: MatchResult[] = [];
  const skuToProduct = new Map<string, ExtractedProduct>();
  
  // Build lookup map
  for (const prod of extractedProducts) {
    skuToProduct.set(prod.sku, prod);
  }
  
  // Try to match each supply
  for (const supply of suppliesWithoutSku) {
    let bestMatch: MatchResult | null = null;
    let bestScore = 0;
    
    for (const [sku, product] of skuToProduct) {
      const score = similarity(supply.name, product.name);
      
      // Additional scoring for brand matches
      const supplyBrand = supply.brand?.toLowerCase() || '';
      const productName = product.name.toLowerCase();
      
      let bonusScore = 0;
      if (supplyBrand && productName.includes(supplyBrand)) {
        bonusScore += 0.15;
      }
      
      // Check for size/variant matches
      const sizeMatch = supply.name.match(/(\d+(?:\.\d+)?)\s*(oz|lb|gal|ct|pk|in|ft|w|gph)/i);
      const productSizeMatch = product.name.match(/(\d+(?:\.\d+)?)\s*(oz|lb|gal|ct|pk|in|ft|w|gph)/i);
      if (sizeMatch && productSizeMatch && sizeMatch[0].toLowerCase() === productSizeMatch[0].toLowerCase()) {
        bonusScore += 0.2;
      }
      
      const totalScore = score + bonusScore;
      
      if (totalScore > bestScore && totalScore >= 0.5) {
        bestScore = totalScore;
        bestMatch = {
          supplyId: supply.id,
          supplyName: supply.name,
          invoiceName: product.name,
          sku: sku,
          confidence: totalScore
        };
      }
    }
    
    if (bestMatch && bestMatch.confidence >= 0.6) {
      matches.push(bestMatch);
    }
  }
  
  console.log(`Found ${matches.length} potential matches\n`);
  
  // Sort by confidence
  matches.sort((a, b) => b.confidence - a.confidence);
  
  // Show high-confidence matches
  console.log('High confidence matches (>= 0.75):');
  const highConfidence = matches.filter(m => m.confidence >= 0.75);
  console.log(`  Count: ${highConfidence.length}\n`);
  
  for (const match of highConfidence.slice(0, 20)) {
    console.log(`  [${match.confidence.toFixed(2)}] "${match.supplyName}" => "${match.invoiceName}" (SKU: ${match.sku})`);
  }
  
  // Apply high-confidence matches
  console.log('\n\nApplying high-confidence matches...');
  let applied = 0;
  
  for (const match of highConfidence) {
    try {
      await db
        .update(supplies)
        .set({ sku: match.sku })
        .where(eq(supplies.id, match.supplyId));
      applied++;
    } catch (err) {
      console.error(`  Failed to update supply ${match.supplyId}: ${err}`);
    }
  }
  
  console.log(`Applied ${applied} SKU updates\n`);
  
  // Show medium confidence matches for review
  console.log('Medium confidence matches (0.6-0.75):');
  const mediumConfidence = matches.filter(m => m.confidence >= 0.6 && m.confidence < 0.75);
  console.log(`  Count: ${mediumConfidence.length}\n`);
  
  for (const match of mediumConfidence.slice(0, 20)) {
    console.log(`  [${match.confidence.toFixed(2)}] "${match.supplyName}" => "${match.invoiceName}" (SKU: ${match.sku})`);
  }
  
  // Also apply medium confidence matches since they're still likely correct
  console.log('\nApplying medium-confidence matches...');
  let appliedMedium = 0;
  
  for (const match of mediumConfidence) {
    try {
      await db
        .update(supplies)
        .set({ sku: match.sku })
        .where(eq(supplies.id, match.supplyId));
      appliedMedium++;
    } catch (err) {
      console.error(`  Failed to update supply ${match.supplyId}: ${err}`);
    }
  }
  
  console.log(`Applied ${appliedMedium} medium-confidence SKU updates\n`);
  
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
  console.log(`Total matches applied: ${applied + appliedMedium}`);
  console.log(`Supplies with SKU now: ${totalWithSku[0].count}`);
  console.log(`Supplies still without SKU: ${remainingWithoutSku[0].count}`);
  
  return {
    applied: applied + appliedMedium,
    remaining: remainingWithoutSku[0].count
  };
}

runComprehensiveMatch()
  .then(result => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
