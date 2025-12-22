import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, or, isNull, eq } from "drizzle-orm";
import fs from 'fs';

interface UpcEntry {
  upc: string;
  name: string;
}

function extractBrand(name: string): string {
  const brands = [
    'Blue Buffalo', 'Science Diet', 'Royal Canin', 'Purina', 'Iams', 'Wellness',
    'Nutro', 'Merrick', 'Orijen', 'Acana', 'Canidae', 'Fromm', 'Taste of the Wild',
    'Zignature', 'Instinct', 'Natural Balance', 'Nulo', 'Nutrisource', 'Victor',
    'Earthborn', 'Solid Gold', 'Stella Chewy', 'Open Farm', 'Primal',
    'Zoo Med', 'ZooMed', 'Exo Terra', 'Hikari', 'Tetra', 'Fluval', 'API', 
    'Aqueon', 'Marineland', 'SeaChem', 'Penn-Plax', 'Penn Plax', 'Prevue',
    'Kaytee', 'Oxbow', 'Vitakraft', 'Living World', 'Ware',
    'Kong', 'Nylabone', 'Chuckit', 'JW Pet', 'Outward Hound',
    'Coastal', 'Lupine', 'PetSafe', 'Kurgo', 'Ruffwear',
    'Furminator', 'Andis', 'Oster', 'Safari', 'Hertzko',
    'Greenies', 'Whimzees', 'SmartBones', 'Milk-Bone', 'Pup-Peroni',
    'Friskies', 'Fancy Feast', 'Sheba', 'Weruva', 'Tiki Cat',
    'FreshPet', 'Zuke', 'Bil Jac', 'Evangers', 'Lotus'
  ];
  
  const lower = name.toLowerCase();
  for (const brand of brands) {
    if (lower.includes(brand.toLowerCase())) {
      return brand.toLowerCase().replace(/[^a-z]/g, '');
    }
  }
  
  const firstWord = name.split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, '');
  return firstWord?.toLowerCase() || '';
}

function extractSizeTokens(str: string): string[] {
  const matches = str.match(/\d+\.?\d*\s*(oz|lb|lbs|g|kg|ml|l|ct|pk|pack|count|gal|qt|pt)/gi) || [];
  return matches.map(m => m.toLowerCase().replace(/\s+/g, ''));
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function normalizeForMatch(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function main() {
  console.log("=== BRAND-SCOPED FUZZY MATCHER ===\n");

  const maybeUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  let ocrUpcs: UpcEntry[] = [];
  try {
    ocrUpcs = JSON.parse(fs.readFileSync('scripts/pdf_ocr_upcs.json', 'utf-8'));
  } catch {}

  const allUpcs = [...maybeUpcs, ...ocrUpcs].filter(e => e.upc?.length >= 10);
  console.log(`Total UPC entries: ${allUpcs.length}`);

  const upcByBrand = new Map<string, UpcEntry[]>();
  for (const entry of allUpcs) {
    const brand = extractBrand(entry.name);
    if (!upcByBrand.has(brand)) upcByBrand.set(brand, []);
    upcByBrand.get(brand)!.push(entry);
  }
  
  console.log(`Brands with UPCs: ${upcByBrand.size}`);

  const productsWithoutSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(or(isNull(supplies.sku), eq(supplies.sku, '')));

  console.log(`Products without SKU: ${productsWithoutSku.length}\n`);

  const updates: { id: number; sku: string; productName: string; matchedName: string; sim: number; method: string }[] = [];

  for (const product of productsWithoutSku) {
    const productBrand = extractBrand(product.brand || product.name);
    const productName = normalizeForMatch(product.name);
    const productSizes = extractSizeTokens(product.name);
    
    const candidates = upcByBrand.get(productBrand) || [];
    if (candidates.length === 0) continue;

    let bestMatch: { entry: UpcEntry; sim: number; sizeMatch: boolean } | null = null;

    for (const entry of candidates) {
      const entryName = normalizeForMatch(entry.name);
      const entrySizes = extractSizeTokens(entry.name);
      
      const sim = similarity(productName, entryName);
      const sizeMatch = productSizes.some(ps => entrySizes.some(es => es === ps || es.includes(ps) || ps.includes(es)));
      
      const effectiveSim = sizeMatch ? sim + 0.1 : sim;
      
      if (effectiveSim > 0.7 && (!bestMatch || effectiveSim > bestMatch.sim + (bestMatch.sizeMatch ? 0.1 : 0))) {
        bestMatch = { entry, sim: effectiveSim, sizeMatch };
      }
    }

    if (bestMatch) {
      updates.push({
        id: product.id,
        sku: bestMatch.entry.upc,
        productName: product.name,
        matchedName: bestMatch.entry.name,
        sim: bestMatch.sim,
        method: bestMatch.sizeMatch ? 'fuzzy+size' : 'fuzzy'
      });
    }
  }

  console.log(`Found ${updates.length} matches\n`);
  
  const byMethod: Record<string, number> = {};
  updates.forEach(u => { byMethod[u.method] = (byMethod[u.method] || 0) + 1; });
  console.log("By method:", byMethod);

  console.log("\nTop matches by similarity:");
  updates.sort((a, b) => b.sim - a.sim).slice(0, 20).forEach(u => {
    console.log(`  ${u.sim.toFixed(2)} [${u.method}] "${u.productName.slice(0, 35)}" -> "${u.matchedName.slice(0, 35)}"`);
  });

  if (updates.length > 0) {
    console.log("\nApplying updates...");
    for (const u of updates) {
      await db.update(supplies).set({ sku: u.sku }).where(eq(supplies.id, u.id));
    }
    console.log(`Applied ${updates.length} updates`);
  }

  const result = await db.execute(sql`
    SELECT COUNT(*) as total, 
           COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_sku
    FROM supplies
  `);
  
  const row = result.rows[0] as { total: string; with_sku: string };
  console.log(`\nFinal coverage: ${row.with_sku}/${row.total} (${(100 * parseInt(row.with_sku) / parseInt(row.total)).toFixed(1)}%)`);
}

main().catch(console.error);
