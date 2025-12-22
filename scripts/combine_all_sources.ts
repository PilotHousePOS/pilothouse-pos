import fs from 'fs';
import path from 'path';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

async function main() {
  console.log('=== COMBINING ALL UPC SOURCES ===\n');
  
  const allUPCs = new Map<string, UPCEntry>();
  
  // Source 1: Maybe Inventory (7,322 UPCs)
  console.log('Loading Maybe Inventory...');
  const maybeUPCs: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  for (const entry of maybeUPCs) {
    const cleanUPC = entry.upc.replace(/[^0-9]/g, '').padStart(12, '0');
    if (cleanUPC.length >= 10 && !allUPCs.has(cleanUPC)) {
      allUPCs.set(cleanUPC, { upc: cleanUPC, name: entry.name, source: 'maybe_inventory' });
    }
  }
  console.log(`  Added from Maybe Inventory: ${maybeUPCs.length} -> ${allUPCs.size} unique`);
  
  // Source 2: Google Spreadsheet
  console.log('Loading Google Spreadsheet...');
  const googleCSV = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  const googleLines = googleCSV.split('\n').filter(l => l.trim());
  let googleCount = 0;
  for (const line of googleLines.slice(1)) { // skip header
    const parts = line.split(',');
    if (parts.length >= 2) {
      const upc = parts[0].replace(/[^0-9]/g, '').padStart(12, '0');
      const name = parts[1];
      if (upc.length >= 10 && !allUPCs.has(upc)) {
        allUPCs.set(upc, { upc, name, source: 'google_sheet' });
        googleCount++;
      }
    }
  }
  console.log(`  Added from Google Sheet: ${googleCount} new (total: ${allUPCs.size})`);
  
  // Source 3: PDF Extracted UPCs (from verified_upcs.json)
  console.log('Loading PDF extracted UPCs...');
  if (fs.existsSync('scripts/verified_upcs.json')) {
    const pdfUPCs: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/verified_upcs.json', 'utf-8'));
    let pdfCount = 0;
    for (const entry of pdfUPCs) {
      const cleanUPC = entry.upc.replace(/[^0-9]/g, '').padStart(12, '0');
      if (cleanUPC.length >= 10 && !allUPCs.has(cleanUPC)) {
        allUPCs.set(cleanUPC, { upc: cleanUPC, name: entry.name, source: entry.source || 'pdf_invoice' });
        pdfCount++;
      }
    }
    console.log(`  Added from PDF invoices: ${pdfCount} new (total: ${allUPCs.size})`);
  }
  
  // Source 4: CamScanner OCR UPCs
  console.log('Loading CamScanner UPCs...');
  if (fs.existsSync('scripts/camscanner_upcs.json')) {
    const camUPCs: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/camscanner_upcs.json', 'utf-8'));
    let camCount = 0;
    for (const entry of camUPCs) {
      const cleanUPC = entry.upc.replace(/[^0-9]/g, '').padStart(12, '0');
      if (cleanUPC.length >= 10 && !allUPCs.has(cleanUPC)) {
        allUPCs.set(cleanUPC, { upc: cleanUPC, name: entry.name, source: 'camscanner' });
        camCount++;
      }
    }
    console.log(`  Added from CamScanner: ${camCount} new (total: ${allUPCs.size})`);
  }
  
  // Source 5: Excel inventory UPCs
  console.log('Loading Excel inventory UPCs...');
  if (fs.existsSync('.local/state/memory/excel_inventory_upcs.json')) {
    const excelUPCs: UPCEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/excel_inventory_upcs.json', 'utf-8'));
    let excelCount = 0;
    for (const entry of excelUPCs) {
      const cleanUPC = entry.upc.replace(/[^0-9]/g, '').padStart(12, '0');
      if (cleanUPC.length >= 10 && !allUPCs.has(cleanUPC)) {
        allUPCs.set(cleanUPC, { upc: cleanUPC, name: entry.name, source: 'excel_inventory' });
        excelCount++;
      }
    }
    console.log(`  Added from Excel inventory: ${excelCount} new (total: ${allUPCs.size})`);
  }
  
  // Save complete master list
  const masterList = Array.from(allUPCs.values());
  fs.writeFileSync('scripts/master_verified_upcs.json', JSON.stringify(masterList, null, 2));
  
  console.log(`\n=== FINAL MASTER LIST: ${masterList.length} unique UPCs ===`);
  
  // Count by source
  const bySrc = new Map<string, number>();
  for (const entry of masterList) {
    bySrc.set(entry.source, (bySrc.get(entry.source) || 0) + 1);
  }
  console.log('\nBy source:');
  for (const [src, count] of bySrc) {
    console.log(`  ${src}: ${count}`);
  }
}

main().catch(console.error);
