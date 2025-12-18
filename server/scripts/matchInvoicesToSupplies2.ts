import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, isNull, sql, and, ilike } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface InvoiceItem {
  upc: string;
  description: string;
  productCode?: string;
  brand?: string;
}

const BRAND_PREFIXES: Record<string, string> = {
  'API': 'API',
  'AQE': 'Aqueon',
  'HIK': 'Hikari',
  'TET': 'Tetra',
  'SLI': 'Seachem',
  'KAY': 'Kaytee',
  'ZML': 'Zoo Med',
  'ZM': 'Zoo Med',
  'FLK': "Fluker's",
  'EXT': 'Exo Terra',
  'ZIL': 'Zilla',
  'MRL': 'Marineland',
  'ATP': 'Aquatop',
  'WWI': 'Worldwide',
  'JWP': 'JW Pet',
  'KMP': 'Kaytee',
  'OXB': 'Oxbow',
  'NTS': 'Nutrisource',
  'FRM': 'Fromm',
  'RBP': 'RedBarn',
  'NTB': 'Nylabone',
  'SPT': 'Spot',
  'ETH': 'Ethical',
  'KNG': 'Kong',
  'PPX': 'Penn-Plax',
  'GRN': 'Greenies',
  'BLU': 'Blue Buffalo',
  'CST': 'Coastal',
  'VIT': 'Vitakraft',
  'MAR': 'Marshall',
  'PVU': 'Prevue',
  'LVP': 'Loving Pets',
  'BKW': 'Barkworthies',
  'SMK': 'Smokehouse',
  'NTH': "Nothin' to Hide",
  'WHL': 'Wholehearted',
  'TOW': 'Taste of the Wild',
  'DND': 'Diamond Naturals',
  'VCT': 'VICTOR',
  'NTM': 'Nutri Vet',
};

function parseInvoiceLine(line: string): InvoiceItem | null {
  const match = line.match(/^\s*\d+\/\d?\s+\d+\s+(\d{12,14})\s+(\S*)\s+(.+?)(?:\s+EA|\s+CS|\s+PK|$)/);
  if (match) {
    const desc = match[3].trim();
    const words = desc.split(/\s+/);
    const brandPrefix = words[0]?.toUpperCase();
    const brand = BRAND_PREFIXES[brandPrefix];
    
    return {
      upc: match[1],
      productCode: match[2] || undefined,
      description: desc,
      brand
    };
  }
  return null;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .trim();
}

function extractSize(text: string): string | null {
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(oz|lb|#|ct|gal|ml|mg|pk|in|inch)/i);
  if (sizeMatch) {
    let unit = sizeMatch[2].toLowerCase();
    if (unit === '#') unit = 'lb';
    if (unit === 'inch') unit = 'in';
    return `${sizeMatch[1]}${unit}`;
  }
  return null;
}

function extractProductType(desc: string): string[] {
  const normalized = normalizeForMatch(desc);
  const types: string[] = [];
  
  // Extract key product identifiers
  const typePatterns = [
    /\b(stress coat)\b/,
    /\b(accu\s*clear|accuclear)\b/,
    /\b(algaefix|algae fix)\b/,
    /\b(quick start)\b/,
    /\b(master test)\b/,
    /\b(tap water|tapwater)\b/,
    /\b(bettafix|betta fix)\b/,
    /\b(melafix|mela fix)\b/,
    /\b(pimafix|pima fix)\b/,
    /\b(prime)\b/,
    /\b(root tabs)\b/,
    /\b(cichlid gold)\b/,
    /\b(betta food)\b/,
    /\b(goldfish|gold fish)\b/,
    /\b(bloodworm|blood worm)\b/,
    /\b(brine shrimp)\b/,
    /\b(tubifex)\b/,
    /\b(pellet|pellets|pllts)\b/,
    /\b(flake|flakes)\b/,
    /\b(freeze dried|frozen)\b/,
    /\b(spirulina)\b/,
    /\b(run around|runabout)\b/,
    /\b(comfort wheel)\b/,
    /\b(water bottle)\b/,
    /\b(food bowl|food dish)\b/,
    /\b(hay rack)\b/,
    /\b(salt lick)\b/,
    /\b(timothy hay)\b/,
    /\b(orchard grass)\b/,
    /\b(alfalfa)\b/,
  ];
  
  for (const pattern of typePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      types.push(match[1].replace(/\s+/g, ''));
    }
  }
  
  return types;
}

async function parseAllInvoices(): Promise<Map<string, InvoiceItem>> {
  const invoiceItems = new Map<string, InvoiceItem>();
  
  const invoiceDirs = [
    'attached_assets/extracted_orders',
    'attached_assets/extracted_orders2',
    'attached_assets/extracted_orders3',
    'attached_assets/extracted_orders4',
    'attached_assets/extracted_orders5',
    'attached_assets/extracted_orders6',
    'attached_assets/extracted_orders7',
  ];
  
  for (const dir of invoiceDirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const item = parseInvoiceLine(line);
        if (item && item.upc && item.brand) {
          if (!invoiceItems.has(item.upc)) {
            invoiceItems.set(item.upc, item);
          }
        }
      }
    }
  }
  
  return invoiceItems;
}

async function findExactMatches() {
  console.log('Parsing all invoice files...');
  const invoiceItems = await parseAllInvoices();
  console.log(`Found ${invoiceItems.size} invoice items with known brands\n`);
  
  const matches: { supplyId: number; supplyName: string; upc: string; invoiceDesc: string; score: number }[] = [];
  
  for (const [upc, item] of invoiceItems) {
    if (!item.brand) continue;
    
    // Get the product description without brand prefix
    const descWords = item.description.split(/\s+/).slice(1).join(' ');
    const invoiceSize = extractSize(item.description);
    const invoiceTypes = extractProductType(item.description);
    
    // Search for matching supplies by brand
    const candidates = await db.select()
      .from(supplies)
      .where(and(
        isNull(supplies.sku),
        ilike(supplies.brand, `%${item.brand}%`)
      ))
      .limit(200);
    
    for (const supply of candidates) {
      const supplyNorm = normalizeForMatch(supply.name);
      const supplySize = extractSize(supply.name);
      const supplyTypes = extractProductType(supply.name);
      
      let score = 0;
      
      // Size must match if both have sizes
      if (invoiceSize && supplySize) {
        if (invoiceSize === supplySize) {
          score += 30;
        } else {
          continue; // Size mismatch = no match
        }
      }
      
      // Check product type overlap
      const typeOverlap = invoiceTypes.filter(t => supplyTypes.includes(t));
      if (typeOverlap.length > 0) {
        score += 40 * typeOverlap.length;
      }
      
      // Check key word overlap
      const invoiceWords = normalizeForMatch(descWords).split(' ').filter(w => w.length > 2);
      const supplyWords = supplyNorm.split(' ').filter(w => w.length > 2);
      const wordOverlap = invoiceWords.filter(w => supplyWords.some(sw => sw.includes(w) || w.includes(sw)));
      
      if (wordOverlap.length >= 2) {
        score += 10 * wordOverlap.length;
      }
      
      if (score >= 50) {
        matches.push({
          supplyId: supply.id,
          supplyName: supply.name,
          upc,
          invoiceDesc: item.description,
          score
        });
      }
    }
  }
  
  // Sort by score and deduplicate (one UPC per supply)
  matches.sort((a, b) => b.score - a.score);
  
  const usedSupplies = new Set<number>();
  const usedUPCs = new Set<string>();
  const finalMatches: typeof matches = [];
  
  for (const match of matches) {
    if (!usedSupplies.has(match.supplyId) && !usedUPCs.has(match.upc)) {
      usedSupplies.add(match.supplyId);
      usedUPCs.add(match.upc);
      finalMatches.push(match);
    }
  }
  
  console.log(`Found ${finalMatches.length} high-confidence matches\n`);
  console.log('Top matches:');
  finalMatches.slice(0, 30).forEach(m => {
    console.log(`  [${m.score}] ${m.supplyName}`);
    console.log(`       -> ${m.upc}: ${m.invoiceDesc}`);
  });
  
  // Apply matches
  if (finalMatches.length > 0) {
    console.log('\nApplying matches to database...');
    let updated = 0;
    for (const match of finalMatches) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.supplyId));
      updated++;
    }
    console.log(`Updated ${updated} supplies with SKUs`);
  }
  
  // Final count
  const remaining = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(isNull(supplies.sku));
  console.log(`\nRemaining supplies without SKU: ${remaining[0].count}`);
}

findExactMatches().catch(console.error);
