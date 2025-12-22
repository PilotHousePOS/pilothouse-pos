import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

const master: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json', 'utf-8'));
const googleSheet = master.filter(e => e.source === 'google_sheet');
const pdfInvoices = master.filter(e => e.source.includes('.txt'));

console.log(`Google Sheet: ${googleSheet.length}`);
console.log(`PDF Invoices: ${pdfInvoices.length}`);

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/[™®©'"#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyParts(text: string): { brand: string; size: string; tokens: string[] } {
  const norm = normalize(text);
  const parts = norm.split(/\s+/);
  
  const sizePattern = /(\d+(?:\.\d+)?(?:oz|lb|#|g|kg|ml|l|qt|gal|in|"|ft|pk|ct|pc))/i;
  const sizeMatch = norm.match(sizePattern);
  const size = sizeMatch ? sizeMatch[1].replace('#', 'lb') : '';
  
  const brand = parts[0] || '';
  const tokens = parts.filter(p => p.length > 1);
  
  return { brand, size, tokens };
}

function matchScore(dbName: string, srcName: string): number {
  const db = extractKeyParts(dbName);
  const src = extractKeyParts(srcName);
  
  let score = 0;
  
  if (db.brand === src.brand || 
      db.brand.includes(src.brand) || 
      src.brand.includes(db.brand)) {
    score += 30;
  }
  
  if (db.size && src.size) {
    const dbSize = db.size.replace(/[^\d.]/g, '');
    const srcSize = src.size.replace(/[^\d.]/g, '');
    if (dbSize === srcSize) score += 25;
  }
  
  let tokenMatches = 0;
  for (const t of db.tokens) {
    if (src.tokens.some(st => st === t || st.includes(t) || t.includes(st))) {
      tokenMatches++;
    }
  }
  const tokenScore = (tokenMatches / Math.max(db.tokens.length, src.tokens.length)) * 45;
  score += tokenScore;
  
  return score;
}

async function main() {
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
    brand: supplies.brand
  }).from(supplies);
  
  console.log(`\nTotal products: ${products.length}`);
  
  const noSku = products.filter(p => !p.sku || p.sku.trim() === '');
  console.log(`Without SKU: ${noSku.length}`);
  
  console.log('\n=== Matching from Google Sheet ===');
  let googleMatches = 0;
  
  for (const product of noSku) {
    if (product.sku && product.sku.trim() !== '') continue;
    
    let bestMatch: UPCEntry | null = null;
    let bestScore = 0;
    
    for (const entry of googleSheet) {
      const score = matchScore(product.name, entry.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }
    
    if (bestMatch && bestScore >= 70) {
      await db.update(supplies)
        .set({ sku: bestMatch.upc })
        .where(eq(supplies.id, product.id));
      googleMatches++;
      
      if (googleMatches <= 20) {
        console.log(`  [${bestScore.toFixed(0)}] "${product.name}" => "${bestMatch.name}"`);
      }
    }
  }
  console.log(`Google Sheet matches: ${googleMatches}`);
  
  let afterGoogle = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  let withSku = afterGoogle.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`After Google: ${withSku}/${afterGoogle.length} (${((withSku / afterGoogle.length) * 100).toFixed(1)}%)`);
  
  console.log('\n=== Matching from PDF Invoices ===');
  const stillNoSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    sku: supplies.sku,
    brand: supplies.brand
  }).from(supplies);
  
  const remaining = stillNoSku.filter(p => !p.sku || p.sku.trim() === '');
  let pdfMatches = 0;
  
  for (const product of remaining) {
    let bestMatch: UPCEntry | null = null;
    let bestScore = 0;
    
    for (const entry of pdfInvoices) {
      const score = matchScore(product.name, entry.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }
    
    if (bestMatch && bestScore >= 70) {
      await db.update(supplies)
        .set({ sku: bestMatch.upc })
        .where(eq(supplies.id, product.id));
      pdfMatches++;
      
      if (pdfMatches <= 20) {
        console.log(`  [${bestScore.toFixed(0)}] "${product.name}" => "${bestMatch.name}"`);
      }
    }
  }
  console.log(`PDF Invoice matches: ${pdfMatches}`);
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  withSku = final.filter(p => p.sku && p.sku.trim() !== '').length;
  console.log(`\n=== FINAL: ${withSku}/${final.length} (${((withSku / final.length) * 100).toFixed(1)}%) ===`);
}

main().catch(console.error);
