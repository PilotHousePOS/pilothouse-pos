import * as fs from 'fs';
import * as path from 'path';

interface InvoiceItem {
  upc: string;
  description: string;
  source: string;
}

function extractFromInvoice(content: string, filename: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Multiple patterns for different invoice formats
    
    // Pattern 1: Standard invoice line with 12-digit UPC
    // Format: LINE# PRODUCT UPC DESCRIPTION ...
    let match = line.match(/\s+(\d{12,13})\s{2,}([A-Z][A-Z0-9\s\/\.\-\#\'\(\)\&]+?)(?:\s{3,}|\s+(?:EA|CS|BX|PK|DZ|LB)\s)/i);
    if (match) {
      items.push({ upc: match[1], description: match[2].trim(), source: filename });
      continue;
    }
    
    // Pattern 2: UPC at end of line or with specific format
    match = line.match(/([A-Z][A-Z0-9\s\/\.\-\#\'\(\)]+?)\s+(\d{12,13})(?:\s|$)/i);
    if (match && match[1].trim().length >= 5 && match[1].trim().length <= 80) {
      items.push({ upc: match[2], description: match[1].trim(), source: filename });
      continue;
    }
    
    // Pattern 3: Find any 12-13 digit number and grab adjacent text
    const upcMatches = line.match(/\b(\d{12,13})\b/g);
    if (upcMatches) {
      for (const upc of upcMatches) {
        // Extract surrounding text as description
        const idx = line.indexOf(upc);
        const before = line.substring(0, idx).trim();
        const after = line.substring(idx + upc.length).trim();
        
        // Prefer text after UPC (common format)
        let desc = after.replace(/^[\s\-\|\/\\:]+/, '').replace(/[\$\d,\.]+.*$/, '').trim();
        if (desc.length < 5 || desc.length > 100 || /^\d+$/.test(desc)) {
          desc = before.replace(/.*[\d]{4,}/, '').replace(/^[\s\-\|\/\\:]+/, '').trim();
        }
        
        if (desc.length >= 5 && desc.length <= 100 && !/^[\d\s\.\-]+$/.test(desc)) {
          items.push({ upc, description: desc, source: filename });
        }
      }
    }
  }
  
  return items;
}

async function main() {
  const dirs = ['attached_assets/extracted_orders', 'attached_assets/extracted_orders2'];
  const allItems: InvoiceItem[] = [];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    console.log(`Processing ${files.length} files from ${dir}`);
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const items = extractFromInvoice(content, file);
      allItems.push(...items);
    }
  }
  
  console.log(`\nTotal items extracted: ${allItems.length}`);
  
  // Dedupe by UPC
  const byUPC = new Map<string, InvoiceItem>();
  for (const item of allItems) {
    if (!byUPC.has(item.upc)) {
      byUPC.set(item.upc, item);
    }
  }
  
  console.log(`Unique UPCs: ${byUPC.size}`);
  
  // Show samples grouped by likely brand
  console.log('\n=== SAMPLE EXTRACTED ITEMS ===');
  let count = 0;
  for (const [upc, item] of byUPC) {
    if (count++ >= 100) break;
    console.log(`  ${upc}: ${item.description}`);
  }
  
  // Look for Coastal, Science Diet, etc.
  console.log('\n=== COASTAL ITEMS ===');
  count = 0;
  for (const [upc, item] of byUPC) {
    if (item.description.toLowerCase().includes('coastal') || 
        item.description.toLowerCase().includes('cst ') ||
        item.description.includes('CST ')) {
      if (count++ >= 20) break;
      console.log(`  ${upc}: ${item.description}`);
    }
  }
  
  console.log('\n=== SCIENCE DIET ITEMS ===');
  count = 0;
  for (const [upc, item] of byUPC) {
    if (item.description.toLowerCase().includes('science diet') || 
        item.description.toLowerCase().includes('sci diet') ||
        item.description.toLowerCase().includes('s/d ')) {
      if (count++ >= 20) break;
      console.log(`  ${upc}: ${item.description}`);
    }
  }
}

main().catch(console.error);
