import * as fs from 'fs';
import * as path from 'path';

interface UpcRecord { upc: string; name: string; source: string; }

function extractUpcsFromInvoice(content: string): UpcRecord[] {
  const upcs: UpcRecord[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Look for lines with UPC pattern - a 12-14 digit number followed by description
    // Format: LINE PRODUCT UPC *CPN/VPN DESCRIPTION ...
    // Example: 1/3   00800450   015905004503                AQE BULB T8 COLORMAX 18IN 15W
    
    const match = line.match(/^\s*\d+\/\d+\s+\d+\s+(\d{10,14})\s+\S*\s+(.+?)\s+EA\s+/);
    if (match) {
      const upc = match[1];
      let name = match[2].trim();
      // Clean up the name
      name = name.replace(/\s+/g, ' ').trim();
      if (name.length >= 3) {
        upcs.push({ upc, name, source: 'invoice' });
      }
    }
  }
  
  return upcs;
}

function findInvoiceFiles(baseDir: string): string[] {
  const files: string[] = [];
  
  for (let i = 1; i <= 7; i++) {
    const dir = i === 1 ? path.join(baseDir, 'extracted_orders') : path.join(baseDir, `extracted_orders${i}`);
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.endsWith('.txt')) {
          files.push(path.join(dir, entry));
        }
      }
    }
  }
  
  return files;
}

async function main() {
  const invoiceFiles = findInvoiceFiles('attached_assets');
  console.log(`Found ${invoiceFiles.length} invoice files`);
  
  const allUpcs: UpcRecord[] = [];
  
  for (const file of invoiceFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const upcs = extractUpcsFromInvoice(content);
    allUpcs.push(...upcs);
  }
  
  console.log(`Extracted ${allUpcs.length} UPC records from invoices`);
  
  // Deduplicate by UPC, keeping first occurrence
  const upcMap = new Map<string, UpcRecord>();
  for (const u of allUpcs) {
    if (!upcMap.has(u.upc)) {
      upcMap.set(u.upc, u);
    }
  }
  
  const uniqueUpcs = [...upcMap.values()];
  console.log(`Unique UPCs from invoices: ${uniqueUpcs.length}`);
  
  fs.writeFileSync('invoice_upcs.json', JSON.stringify(uniqueUpcs, null, 2));
  console.log('Saved to invoice_upcs.json');
  
  // Show some samples
  console.log('\nSample UPCs:');
  for (const u of uniqueUpcs.slice(0, 20)) {
    console.log(`  ${u.upc} - ${u.name}`);
  }
}

main().catch(console.error);
