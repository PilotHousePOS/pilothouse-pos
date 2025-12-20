import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';

interface InvoiceUpc { upc: string; vendor: string; description: string; }

const VENDOR_BRAND_MAP: Record<string, string> = {
  'AQE': 'Aqueon', 'API': 'API', 'HIK': 'Hikari', 'SLI': 'Seachem',
  'KAY': 'Kaytee', 'ZUP': 'ZuPreem', 'MAR': 'Marina', 'FLU': 'Fluval',
  'TET': 'Tetra', 'ZOO': 'Zoo Med', 'ZML': 'Zoo Med', 'EXO': 'Exo Terra',
  'ZIL': 'Zilla', 'REP': 'Rep-Cal', 'FLK': 'Fluker', 'OSS': 'OSS',
  'JWP': 'JW Pet', 'KNG': 'Kong', 'KON': 'Kong', 'NUT': 'Nutrisource',
  'ETH': 'Ethical', 'COA': 'Coastal', 'BDE': 'Bodhi', 'BDL': 'Bodhi',
  'PBG': 'Pedigree', 'FOU': 'Four Paws', 'MPF': 'Midwest', 'KC': 'Kong',
  'EPC': 'Litter', 'KMP': 'Kaytee', 'WWI': 'Worldwide', 'SA': 'Seachem',
  'ET': 'Ethical', 'U': 'Hikari', 'AR': 'API',
};

const ABBREV_MAP: Record<string, string> = {
  'BULB': 'Bulb', 'FXTR': 'Fixture', 'FOOD': 'Food', 'TRT': 'Treat',
  'CLNR': 'Cleaner', 'GRVL': 'Gravel', 'VAC': 'Vacuum', 'ORNMT': 'Ornament',
  'SBSTRT': 'Substrate', 'FILT': 'Filter', 'CRT': 'Cartridge',
  'PLLT': 'Pellet', 'FLK': 'Flake', 'HTR': 'Heater', 'THERM': 'Thermometer',
  'TOY': 'Toy', 'COND': 'Conditioner', 'SHMP': 'Shampoo',
  'CCHLD': 'Cichlid', 'GLD': 'Gold', 'BETTA': 'Betta', 'TRPCL': 'Tropical',
  'SM': 'Small', 'MD': 'Medium', 'MED': 'Medium', 'LG': 'Large',
  'BK': 'Black', 'BL': 'Blue', 'WH': 'White', 'GR': 'Green',
  'TIEL': 'Cockatiel', 'PRRT': 'Parrot', 'KEET': 'Parakeet',
  'GLOFSH': 'GloFish', 'FW': 'Freshwater',
  'COZIE': 'Cozie', 'XTRM': 'Extreme',
  'RFILL': 'Refill', 'SCRATTLES': 'Scrattles',
  'WTRLSS': 'Waterless', 'PUP': 'Puppy', 'PB': 'Peanut Butter',
  'CT': 'Cat', 'MYLAR': 'Mylar', 'CLAM': 'Clam',
  'STRIPLIGHT': 'Strip Light', 'COLORMAX': 'ColorMax',
};

function expandDescription(desc: string): string {
  let expanded = desc.toUpperCase();
  for (const [abbr, full] of Object.entries(ABBREV_MAP)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*#/g, '$1lb');
  expanded = expanded.replace(/(\d+(?:\.\d+)?)\s*Z\b/g, '$1oz');
  return expanded.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getWords(s: string): Set<string> {
  const words = normalize(s).split(' ').filter(w => w.length >= 2);
  const noise = new Set(['the', 'and', 'for', 'with', 'oz', 'lb', 'ea', 'pk', 'in']);
  return new Set(words.filter(w => !noise.has(w)));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

function getBrand(vendor: string): string {
  const parts = vendor.split('-');
  for (const part of parts) {
    if (VENDOR_BRAND_MAP[part]) return VENDOR_BRAND_MAP[part].toLowerCase();
  }
  if (VENDOR_BRAND_MAP[vendor]) return VENDOR_BRAND_MAP[vendor].toLowerCase();
  return vendor.toLowerCase();
}

async function loadInvoiceUpcs(): Promise<InvoiceUpc[]> {
  const records: InvoiceUpc[] = [];
  const content = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  
  for (const line of content.split('\n')) {
    if (!line.trim() || line.startsWith('UPC')) continue;
    const [upc, vendor, ...descParts] = line.split('|');
    if (upc && /^\d{10,}$/.test(upc.trim())) {
      records.push({
        upc: upc.trim(),
        vendor: vendor?.trim() || '',
        description: descParts.join('|').trim()
      });
    }
  }
  
  return records;
}

async function main() {
  console.log('=== Invoice UPC Matching ===\n');
  
  const invoiceUpcs = await loadInvoiceUpcs();
  console.log(`Loaded ${invoiceUpcs.length} invoice UPCs`);
  
  // Group by brand
  const upcsByBrand = new Map<string, InvoiceUpc[]>();
  for (const upc of invoiceUpcs) {
    const brand = getBrand(upc.vendor);
    if (!upcsByBrand.has(brand)) upcsByBrand.set(brand, []);
    upcsByBrand.get(brand)!.push(upc);
  }
  console.log(`Grouped into ${upcsByBrand.size} brands`);
  
  // Get products without SKU
  const products = await db.select().from(supplies).where(isNull(supplies.sku));
  console.log(`Products needing SKU: ${products.length}`);
  
  // Group products by brand
  const productsByBrand = new Map<string, typeof products>();
  for (const product of products) {
    const brand = (product.brand || '').toLowerCase().replace(/['']/g, '');
    if (!productsByBrand.has(brand)) productsByBrand.set(brand, []);
    productsByBrand.get(brand)!.push(product);
  }
  
  const matches: Array<{ productId: number; productName: string; upc: string; desc: string; score: number }> = [];
  const THRESHOLD = 0.40;
  
  // Match brand to brand
  const brandMappings: Record<string, string[]> = {
    'kong': ['kong', 'kc'],
    'kaytee': ['kaytee', 'kay', 'kmp', 'kt'],
    'aqueon': ['aqueon', 'aqe'],
    'tetra': ['tetra', 'tet'],
    'seachem': ['seachem', 'sli', 'sa'],
    'hikari': ['hikari', 'hik', 'u'],
    'api': ['api', 'ar'],
    'zoo med': ['zoo med', 'zoo', 'zml'],
    'fluval': ['fluval', 'flu'],
    'marina': ['marina', 'mar'],
    'exo terra': ['exo terra', 'exo'],
    'zilla': ['zilla', 'zil'],
    'flukers': ['flukers', 'flk'],
    'zupreem': ['zupreem', 'zup'],
    'jw pet': ['jw pet', 'jwp'],
    'four paws': ['four paws', 'fou'],
    'ethical': ['ethical', 'eth', 'et'],
  };
  
  for (const [productBrand, upcBrands] of Object.entries(brandMappings)) {
    const brandProducts = productsByBrand.get(productBrand) || [];
    if (brandProducts.length === 0) continue;
    
    let allBrandUpcs: InvoiceUpc[] = [];
    for (const ub of upcBrands) {
      allBrandUpcs = allBrandUpcs.concat(upcsByBrand.get(ub) || []);
    }
    if (allBrandUpcs.length === 0) continue;
    
    for (const product of brandProducts) {
      let bestMatch: { upc: string; desc: string; score: number } | null = null;
      
      for (const inv of allBrandUpcs) {
        const expandedDesc = expandDescription(inv.description);
        const descWords = getWords(expandedDesc);
        const productWords = getWords(product.name);
        
        let score = jaccardSimilarity(descWords, productWords);
        
        // Size/weight match bonus
        const descSize = inv.description.match(/\b(SM|MD|LG|XL|XS)\b/i)?.[1]?.toLowerCase();
        const prodSize = product.name.match(/\b(small|medium|large|extra large|extra small)\b/i)?.[1]?.toLowerCase();
        if (descSize && prodSize) {
          const sizeMap: Record<string, string> = { sm: 'small', md: 'medium', lg: 'large', xl: 'extra large', xs: 'extra small' };
          if (sizeMap[descSize] === prodSize) score += 0.1;
        }
        
        // Weight match
        const descWeight = inv.description.match(/(\d+(?:\.\d+)?)\s*(?:OZ|#|LB)/i);
        const prodWeight = product.name.match(/(\d+(?:\.\d+)?)\s*(?:oz|lb)/i);
        if (descWeight && prodWeight && descWeight[1] === prodWeight[1]) score += 0.15;
        
        if (score >= THRESHOLD && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { upc: inv.upc, desc: inv.description, score };
        }
      }
      
      if (bestMatch) {
        matches.push({
          productId: product.id,
          productName: product.name,
          upc: bestMatch.upc,
          desc: bestMatch.desc,
          score: bestMatch.score
        });
      }
    }
  }
  
  console.log(`\nMatches found: ${matches.length}`);
  
  // Apply matches
  let applied = 0;
  for (const match of matches) {
    try {
      await db.execute(sql`UPDATE supplies SET sku = ${match.upc} WHERE id = ${match.productId}`);
      applied++;
    } catch (e: any) {
      console.log(`Failed: ${e.message}`);
    }
  }
  
  console.log(`Applied ${applied} SKUs`);
  
  // Final stats
  const finalProducts = await db.select().from(supplies);
  const withSku = finalProducts.filter(p => p.sku).length;
  const total = finalProducts.length;
  const coverage = ((withSku / total) * 100).toFixed(1);
  
  console.log(`\n=== Final Results ===`);
  console.log(`Products with SKU: ${withSku} / ${total}`);
  console.log(`Coverage: ${coverage}%`);
  
  // Show samples
  const samples = matches.slice(0, 20);
  console.log('\nSample matches:');
  samples.forEach(s => console.log(`  ${s.score.toFixed(2)}: "${s.desc}" -> "${s.productName.substring(0, 50)}"`));
}

main().catch(console.error);
