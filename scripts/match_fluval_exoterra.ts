import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, sql, isNull, or, ilike } from 'drizzle-orm';
import * as fs from 'fs';

// Load Phillips UPCs
const phillipsUpcs = JSON.parse(fs.readFileSync('/tmp/phillips_upcs_v3.json', 'utf8'));

// Also load main extracted UPCs
const mainUpcs = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf8'));

// Merge all UPCs
const allUpcs: Record<string, string> = { ...phillipsUpcs, ...mainUpcs };

console.log(`Total UPCs: ${Object.keys(allUpcs).length}`);

// UPC prefix to brand
const UPC_BRANDS: Record<string, string[]> = {
  '015561': ['Fluval', 'Exo Terra', 'Marina'],
  '076484': ['Coastal'],
  '744845': ['Coastal', "Li'l Pals"],
  '073893': ['Petmate'],
  '660204': ['Fromm'],
  '842982': ['Blue Buffalo'],
  '797801': ['Science Diet'],
  '066380': ['Nutrisource', 'NutriSource'],
  '879213': ['Catit'],
  '073725': ['Prevue'],
  '058496': ['Marineland'],
};

// Abbreviation expansions for descriptions
const ABBREV: Record<string, string> = {
  'TERR': 'TERRA',
  'CKT': 'CRICKET',
  'JNGL': 'JUNGLE',
  'ABUTILON': 'ABUTILON',
  'BTE': 'BITES',
  'CLR': 'COLOR',
  'FLK': 'FLAKE',
  'SM': 'SMALL',
  'MD': 'MEDIUM',
  'LG': 'LARGE',
  'HTR': 'HEATER',
  'SUBMR': 'SUBMERSIBLE',
  'PLSTC': 'PLASTIC',
  'BTTA': 'BETTA',
  'VCTN': 'VACATION',
  'FD': 'FOOD',
  'BLCK': 'BLOCK',
  'AIR': 'AIR',
  'STNE': 'STONE',
  'DSH': 'DISH',
  'WTR': 'WATER',
  'ORN': 'ORNAMENT',
  'DECO': 'DECORATION',
  'TRM': 'TERRARIUM',
  'BGD': 'BACKGROUND',
  'MOSS': 'MOSS',
  'BALL': 'BALL',
  'THERMOMTR': 'THERMOMETER',
  'HYGRO': 'HYGROMETER',
  'LED': 'LED',
  'LAMP': 'LAMP',
  'DOME': 'DOME',
  'RAIN': 'RAIN',
  'CANOPY': 'CANOPY',
  'FOREST': 'FOREST',
  'INSERT': 'INSERT',
  'CRBN': 'CARBON',
  'FLTR': 'FILTER',
  'AC': 'AC',
  'ACT': 'ACTIVATED',
  '3CT': '3 PACK',
  'DLX': 'DELUXE',
};

function cleanDescription(desc: string): string {
  // Remove header noise
  desc = desc.replace(/Item Line Number.*$/g, '')
             .replace(/Est. Ship.*$/g, '')
             .replace(/Number Type/g, '')
             .replace(/Type$/g, '')
             .replace(/Number$/g, '')
             .replace(/Date$/g, '')
             .trim();
  
  // Expand abbreviations
  for (const [abbr, full] of Object.entries(ABBREV)) {
    desc = desc.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  
  return desc;
}

function extractSearchTerms(desc: string): string[] {
  const cleaned = cleanDescription(desc).toLowerCase();
  return cleaned.split(/[\s\/\-\.]+/).filter(w => w.length > 2);
}

function matchScore(searchTerms: string[], productName: string, productDesc: string): number {
  const productText = `${productName} ${productDesc || ''}`.toLowerCase();
  let matches = 0;
  
  for (const term of searchTerms) {
    if (productText.includes(term)) {
      matches++;
    }
  }
  
  return searchTerms.length > 0 ? matches / searchTerms.length : 0;
}

async function main() {
  // Get products without SKU for target brands
  const targetBrands = ['Fluval', 'Exo Terra', 'Marina', 'Coastal', "Li'l Pals", 'Petmate', 
                        'Fromm', 'Blue Buffalo', 'Science Diet', 'Nutrisource', 'NutriSource',
                        'Catit', 'Prevue', 'Marineland'];
  
  const productsNoSku = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  const relevantProducts = productsNoSku.filter(p => 
    p.brand && targetBrands.some(b => 
      p.brand!.toLowerCase() === b.toLowerCase() ||
      p.brand!.toLowerCase().includes(b.toLowerCase())
    )
  );
  
  console.log(`Products without SKU for target brands: ${relevantProducts.length}`);
  
  // Match UPCs to products
  const matches: Array<{upc: string, productId: number, productName: string, desc: string, score: number}> = [];
  
  for (const [upc, rawDesc] of Object.entries(allUpcs)) {
    const prefix = upc.substring(0, 6);
    const brands = UPC_BRANDS[prefix];
    
    if (!brands) continue;
    
    const brandProducts = relevantProducts.filter(p =>
      p.brand && brands.some(b => 
        p.brand!.toLowerCase().includes(b.toLowerCase()) ||
        b.toLowerCase().includes(p.brand!.toLowerCase())
      )
    );
    
    if (brandProducts.length === 0) continue;
    
    const cleanedDesc = cleanDescription(rawDesc);
    if (cleanedDesc.length < 5) continue;
    
    const searchTerms = extractSearchTerms(rawDesc);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const product of brandProducts) {
      const score = matchScore(searchTerms, product.name, product.description || '');
      
      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = product;
      }
    }
    
    if (bestMatch) {
      matches.push({
        upc,
        productId: bestMatch.id,
        productName: bestMatch.name,
        desc: cleanedDesc,
        score: bestScore
      });
    }
  }
  
  // Deduplicate
  const productToMatch = new Map<number, typeof matches[0]>();
  for (const match of matches) {
    const existing = productToMatch.get(match.productId);
    if (!existing || match.score > existing.score) {
      productToMatch.set(match.productId, match);
    }
  }
  
  const upcToMatch = new Map<string, typeof matches[0]>();
  for (const match of productToMatch.values()) {
    const existing = upcToMatch.get(match.upc);
    if (!existing || match.score > existing.score) {
      upcToMatch.set(match.upc, match);
    }
  }
  
  const finalMatches = Array.from(upcToMatch.values()).filter(m => m.score >= 0.5);
  finalMatches.sort((a, b) => b.score - a.score);
  
  console.log(`\nFound ${finalMatches.length} high-confidence matches`);
  
  // Apply matches
  let updated = 0;
  for (const match of finalMatches) {
    const [existing] = await db.select()
      .from(supplies)
      .where(eq(supplies.id, match.productId));
    
    if (existing && (!existing.sku || existing.sku === '')) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.productId));
      updated++;
      if (updated <= 25) {
        console.log(`Updated: ${match.productName} -> ${match.upc} (${(match.score * 100).toFixed(0)}%)`);
      }
    }
  }
  
  console.log(`\nUpdated ${updated} products`);
  
  // Get new coverage
  const result = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_sku
    FROM supplies
  `);
  
  const stats = result.rows[0] as any;
  console.log(`Coverage: ${stats.with_sku}/${stats.total} = ${((Number(stats.with_sku) / Number(stats.total)) * 100).toFixed(2)}%`);
  
  process.exit(0);
}

main().catch(console.error);
