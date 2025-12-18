import { db } from '../db';
import { supplies } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// Read unmatched items
const csvPath = path.join(process.cwd(), 'attached_assets', 'unmatched_invoice_items.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const csvLines = csvContent.split('\n').slice(1).filter(line => line.trim());

interface UnmatchedItem {
  upc: string;
  original: string;
  expanded: string;
}

const unmatchedItems: UnmatchedItem[] = csvLines.map(line => {
  const match = line.match(/^"?([^",]+)"?,\s*"([^"]+)",\s*"([^"]+)"$/);
  if (!match) {
    const parts = line.split(',');
    return { upc: parts[0], original: parts[1]?.replace(/"/g, '') || '', expanded: parts[2]?.replace(/"/g, '') || '' };
  }
  return { upc: match[1], original: match[2], expanded: match[3] };
});

console.log(`Loaded ${unmatchedItems.length} unmatched items from CSV`);

// Parse invoice files to get prices
interface InvoiceItem {
  upc: string;
  description: string;
  netPrice: number;
  listPrice: number;
}

const invoiceDirs = [
  'attached_assets/extracted_orders',
  'attached_assets/extracted_orders2', 
  'attached_assets/extracted_orders3',
  'attached_assets/extracted_orders4',
  'attached_assets/extracted_orders5',
  'attached_assets/extracted_orders6',
  'attached_assets/extracted_orders7',
];

const invoiceItems = new Map<string, InvoiceItem>();

for (const dir of invoiceDirs) {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) continue;
  
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.txt'));
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      // Parse invoice line format: LINE PRODUCT UPC ... DESCRIPTION ... LIST NET EXTENDED
      // Example: 1/3   00800450   015905004503                AQE BULB T8 COLORMAX 18IN 15W           EA    1    1    6.964    5.220    5.22
      
      // Try to find lines with UPC codes (12-13 digits)
      const upcMatch = line.match(/(\d{12,13})/);
      if (!upcMatch) continue;
      
      const upc = upcMatch[1];
      
      // Extract price - look for decimal numbers at end of line
      const priceMatches = line.match(/(\d+\.\d{2,3})\s+(\d+\.\d{2,3})\s+(\d+\.\d{2})\s*[A-Z]*\s*$/);
      if (priceMatches) {
        const listPrice = parseFloat(priceMatches[1]);
        const netPrice = parseFloat(priceMatches[2]);
        
        // Extract description - text between UPC and prices
        const descStart = line.indexOf(upc) + upc.length;
        const descEnd = line.indexOf(priceMatches[1]);
        let description = line.substring(descStart, descEnd).trim();
        
        // Clean up description - remove leading codes
        description = description.replace(/^[A-Z]{2,4}-?\d*\s+/, '').trim();
        description = description.replace(/^[A-Z]{2,3}\s+/, '').trim();
        
        if (!invoiceItems.has(upc) || invoiceItems.get(upc)!.netPrice === 0) {
          invoiceItems.set(upc, { upc, description, netPrice, listPrice });
        }
      }
    }
  }
}

console.log(`Parsed ${invoiceItems.size} items with prices from invoices`);

// Known brands from UPC prefixes or description patterns
const brandPatterns: Array<{pattern: RegExp, brand: string}> = [
  { pattern: /^AQE\s|AQUEON/i, brand: 'Aqueon' },
  { pattern: /^HIK\s|HIKARI/i, brand: 'Hikari' },
  { pattern: /^TET\s|TETRA/i, brand: 'Tetra' },
  { pattern: /^API\s/i, brand: 'API' },
  { pattern: /^SLI\s|SEACHEM/i, brand: 'Seachem' },
  { pattern: /^ZML\s|ZOO MED|ZOOMED/i, brand: 'Zoo Med' },
  { pattern: /^KAY\s|KAYTEE/i, brand: 'Kaytee' },
  { pattern: /^NYL\s|NYLABONE/i, brand: 'Nylabone' },
  { pattern: /^KON\s|KONG/i, brand: 'Kong' },
  { pattern: /^GRN\s|GREENIES/i, brand: 'Greenies' },
  { pattern: /^FRM\s|FROMM/i, brand: 'Fromm' },
  { pattern: /^CAN\s|CANIDAE/i, brand: 'Canidae' },
  { pattern: /^NUT\s|NUTRISOURCE/i, brand: 'NutriSource' },
  { pattern: /^OXB\s|OXBOW/i, brand: 'Oxbow' },
  { pattern: /^FLK\s|FLUKER/i, brand: 'Fluker\'s' },
  { pattern: /^EXT\s|EXOTERRA|EXO TERRA/i, brand: 'Exo Terra' },
  { pattern: /^ZIL\s|ZILLA/i, brand: 'Zilla' },
  { pattern: /^MAR\s|MARSHALL/i, brand: 'Marshall' },
  { pattern: /^CST\s|COASTAL/i, brand: 'Coastal' },
  { pattern: /^JWP\s|JW\s/i, brand: 'JW Pet' },
  { pattern: /^PNP\s|PENN PLAX/i, brand: 'Penn Plax' },
  { pattern: /^SPT\s|SPOT/i, brand: 'Spot' },
  { pattern: /^WHM\s|WHIMZEES/i, brand: 'Whimzees' },
  { pattern: /^FMN\s|FURMINATOR/i, brand: 'Furminator' },
  { pattern: /CAREFRESH|^CF\s/i, brand: 'Carefresh' },
  { pattern: /KOMODO/i, brand: 'Komodo' },
  { pattern: /WHOLESOME|^WHSM\s/i, brand: 'Wholesome' },
  { pattern: /IAMS|^IAM\s/i, brand: 'Iams' },
  { pattern: /PROACTIVE|^PAH\s/i, brand: 'Iams' },
  { pattern: /NATURAL BALANCE|^NB\s/i, brand: 'Natural Balance' },
  { pattern: /PUP.?PERONI/i, brand: 'Pup-Peroni' },
];

function extractBrand(desc: string): string | null {
  for (const bp of brandPatterns) {
    if (bp.pattern.test(desc)) {
      return bp.brand;
    }
  }
  return null;
}

// Category detection from description
function detectCategory(desc: string): string {
  const lower = desc.toLowerCase();
  
  // Aquatic
  if (/aqua|fish|betta|cichlid|tetra|goldfish|glofish|gravel|filter|tank|aquarium|algae|brine|bloodworm|frozen.*worm/i.test(lower)) {
    return 'aquatics';
  }
  
  // Reptile
  if (/reptile|reptisun|snake|gecko|dragon|tortoise|turtle|terrarium|uvb|basking|cricket|mealworm|repti|bearded/i.test(lower)) {
    return 'reptiles';
  }
  
  // Bird
  if (/bird|parakeet|parrot|cockatiel|finch|canary|perch|millet|seed.*bird/i.test(lower)) {
    return 'birdSupplies';
  }
  
  // Small animal
  if (/hamster|gerbil|guinea pig|rabbit|ferret|chinchilla|mouse|rat|timothy|hay|wheel|bedding|carefresh/i.test(lower)) {
    return 'smallAnimalSupplies';
  }
  
  // Cat
  if (/\bcat\b|feline|kitten|catnip|litter|scratc/i.test(lower)) {
    return 'catSupplies';
  }
  
  // Dog food
  if (/\bdry\b.*food|\bcan\b.*food|kibble|dog food/i.test(lower)) {
    return 'dogFood';
  }
  
  // Dog treats
  if (/\btreat\b|\bbiscuit\b|dental.*chew|pill.*pocket|jerky|bone.*chew/i.test(lower)) {
    return 'dogTreats';
  }
  
  // Toys
  if (/\btoy\b|ball|rope|tug|squeaky|plush|chew.*toy/i.test(lower)) {
    return 'toys';
  }
  
  // Healthcare
  if (/shampoo|conditioner|medicine|supplement|vitamin|flea|tick|worm|remedy/i.test(lower)) {
    return 'healthcare';
  }
  
  return 'accessories';
}

// Calculate retail price (2x markup from net)
function calculateRetailPrice(netPrice: number): number {
  return Math.round(netPrice * 2 * 100) / 100;
}

async function main() {
  let created = 0;
  let skipped = 0;
  let noPrice = 0;
  
  for (const item of unmatchedItems) {
    // Check if SKU already exists in database
    const existing = await db.select({ id: supplies.id })
      .from(supplies)
      .where(eq(supplies.sku, item.upc))
      .limit(1);
    
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    
    // Get price from invoice data
    const invoiceData = invoiceItems.get(item.upc);
    
    if (!invoiceData || invoiceData.netPrice === 0) {
      noPrice++;
      console.log(`No price for: ${item.upc} - ${item.expanded}`);
      continue;
    }
    
    // Extract brand and category
    const brand = extractBrand(item.original) || extractBrand(item.expanded);
    const category = detectCategory(item.expanded);
    const retailPrice = calculateRetailPrice(invoiceData.netPrice);
    
    // Clean up name
    let name = item.expanded
      .replace(/^\d+\s*/, '') // Remove leading numbers
      .replace(/\s+/g, ' ')
      .trim();
    
    // Add brand to name if not present
    if (brand && !name.toLowerCase().includes(brand.toLowerCase())) {
      name = `${brand} ${name}`;
    }
    
    // Capitalize properly
    name = name.split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .replace(/\b(Oz|Ml|Qt|Lb|In|Sm|Md|Lg|Xl|Xs)\b/gi, m => m.toUpperCase())
      .replace(/\bUvb\b/gi, 'UVB')
      .replace(/\bLed\b/gi, 'LED');
    
    // Create the supply
    await db.insert(supplies).values({
      name,
      category,
      brand,
      price: retailPrice.toString(),
      sku: item.upc,
      description: `Supplier cost: $${invoiceData.netPrice.toFixed(2)}`,
      stockQuantity: 0,
      isActive: true,
      priceSource: 'import',
    });
    
    created++;
    if (created <= 20) {
      console.log(`Created: ${name} ($${retailPrice}) [${category}] SKU: ${item.upc}`);
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${created} new supplies`);
  console.log(`Skipped (already exists): ${skipped}`);
  console.log(`No price found: ${noPrice}`);
}

main().catch(console.error);
