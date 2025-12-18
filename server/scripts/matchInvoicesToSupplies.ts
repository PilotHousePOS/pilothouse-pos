import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, isNull, ilike, or, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface InvoiceItem {
  upc: string;
  description: string;
  productCode?: string;
}

function parseInvoiceLine(line: string): InvoiceItem | null {
  // Match lines with format: LINE PRODUCT UPC DESCRIPTION
  // Example: " 7/1   04003085   317163030851    AR-85B      API COND STRESS COAT 4OZ"
  const match = line.match(/^\s*\d+\/\d?\s+\d+\s+(\d{12,14})\s+(\S*)\s+(.+?)(?:\s+EA|\s+CS|\s+PK|$)/);
  if (match) {
    return {
      upc: match[1],
      productCode: match[2] || undefined,
      description: match[3].trim()
    };
  }
  return null;
}

function normalizeDescription(desc: string): string {
  return desc
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .toLowerCase()
    .trim();
}

function extractBrand(desc: string): string | null {
  const brandPrefixes: Record<string, string> = {
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
    'WWI': 'Worldwide Imports',
    'JWP': 'JW Pet',
    'KMP': 'Kaytee',
    'OXB': 'Oxbow',
    'NTS': 'Nutrisource',
    'FRM': 'Fromm',
    'RBP': 'RedBarn',
    'NTB': 'Nylabone',
    'SPT': 'Spot',
    'ETH': 'Ethical Pet',
    'KNG': 'Kong',
    'PPX': 'Penn-Plax',
    'GRN': 'Greenies',
    'BLU': 'Blue Buffalo',
  };
  
  const words = desc.split(/\s+/);
  if (words.length > 0) {
    const prefix = words[0].toUpperCase();
    return brandPrefixes[prefix] || null;
  }
  return null;
}

function generateSearchTerms(desc: string): string[] {
  const normalized = normalizeDescription(desc);
  const words = normalized.split(' ').filter(w => w.length > 2);
  
  // Generate key terms for searching
  const terms: string[] = [];
  
  // Full product name minus brand prefix
  if (words.length > 1) {
    terms.push(words.slice(1).join(' '));
  }
  
  // Key product words
  const keyWords = words.filter(w => 
    !['ea', 'cs', 'pk', 'oz', 'lb', 'ct', 'gal', 'ml', 'mg'].includes(w) &&
    w.length > 3
  );
  if (keyWords.length >= 2) {
    terms.push(keyWords.join(' '));
  }
  
  return terms;
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
        if (item && item.upc) {
          // Keep first occurrence (usually most descriptive)
          if (!invoiceItems.has(item.upc)) {
            invoiceItems.set(item.upc, item);
          }
        }
      }
    }
  }
  
  return invoiceItems;
}

async function matchAndAssignSKUs() {
  console.log('Parsing all invoice files...');
  const invoiceItems = await parseAllInvoices();
  console.log(`Found ${invoiceItems.size} unique UPCs in invoices`);
  
  // Get supplies without SKUs
  const suppliesWithoutSKU = await db.select()
    .from(supplies)
    .where(isNull(supplies.sku));
  
  console.log(`Found ${suppliesWithoutSKU.length} supplies without SKUs`);
  
  let matchedCount = 0;
  const matchedItems: { id: number; name: string; upc: string; invoiceDesc: string }[] = [];
  
  for (const supply of suppliesWithoutSKU) {
    const supplyName = normalizeDescription(supply.name);
    const supplyBrand = supply.brand?.toLowerCase() || '';
    
    // Try to find matching invoice item
    for (const [upc, item] of invoiceItems) {
      const itemDesc = normalizeDescription(item.description);
      const itemBrand = extractBrand(item.description)?.toLowerCase() || '';
      
      // Check for match: brand + key product terms
      let isMatch = false;
      
      // Brand must match if both have brands
      if (supplyBrand && itemBrand && !supplyBrand.includes(itemBrand) && !itemBrand.includes(supplyBrand)) {
        continue;
      }
      
      // Check if supply name contains key terms from invoice
      const searchTerms = generateSearchTerms(item.description);
      for (const term of searchTerms) {
        if (supplyName.includes(term) || term.includes(supplyName)) {
          isMatch = true;
          break;
        }
      }
      
      // Also check for size/weight match
      const sizeMatch = item.description.match(/(\d+(?:\.\d+)?)\s*(oz|lb|#|ct|gal|ml)/i);
      const supplySizeMatch = supply.name.match(/(\d+(?:\.\d+)?)\s*(oz|lb|#|ct|gal|ml)/i);
      
      if (isMatch && sizeMatch && supplySizeMatch) {
        // Sizes must match
        if (sizeMatch[1] !== supplySizeMatch[1]) {
          isMatch = false;
        }
      }
      
      if (isMatch) {
        matchedItems.push({
          id: supply.id,
          name: supply.name,
          upc: upc,
          invoiceDesc: item.description
        });
        break;
      }
    }
  }
  
  console.log(`\nFound ${matchedItems.length} potential matches`);
  console.log('\nSample matches:');
  matchedItems.slice(0, 20).forEach(m => {
    console.log(`  ${m.name}`);
    console.log(`    -> UPC: ${m.upc} (${m.invoiceDesc})`);
  });
  
  // Update database
  if (matchedItems.length > 0) {
    console.log('\nUpdating database...');
    for (const match of matchedItems) {
      await db.update(supplies)
        .set({ sku: match.upc })
        .where(eq(supplies.id, match.id));
      matchedCount++;
    }
    console.log(`Updated ${matchedCount} supplies with SKUs`);
  }
  
  // Report remaining
  const remainingWithoutSKU = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(isNull(supplies.sku));
  
  console.log(`\nRemaining supplies without SKU: ${remainingWithoutSKU[0].count}`);
}

matchAndAssignSKUs().catch(console.error);
