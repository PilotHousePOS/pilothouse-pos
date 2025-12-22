import fs from 'fs';
import ExcelJS from 'exceljs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

function cleanUPC(upc: string): string {
  const cleaned = upc.toString().replace(/[^0-9]/g, '');
  if (cleaned.length < 10) return '';
  return cleaned.padStart(12, '0');
}

function cleanName(name: string): string {
  return name.toString()
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractFromExcel(filePath: string): Promise<UPCEntry[]> {
  const entries: UPCEntry[] = [];
  const workbook = new ExcelJS.Workbook();
  
  try {
    await workbook.xlsx.readFile(filePath);
    const fileName = filePath.split('/').pop() || filePath;
    
    workbook.eachSheet((worksheet) => {
      let upcCol = -1;
      let nameCol = -1;
      let descCol = -1;
      
      // Find UPC and name columns from header row
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().toLowerCase() || '';
        if (val.includes('upc') || val.includes('barcode') || val.includes('sku')) {
          upcCol = colNumber;
        }
        if (val.includes('name') || val.includes('item') || val.includes('product') || val.includes('description')) {
          if (nameCol === -1) nameCol = colNumber;
          else descCol = colNumber;
        }
      });
      
      // If no header found, try common positions
      if (upcCol === -1) upcCol = 1;
      if (nameCol === -1) nameCol = 2;
      
      // Extract data rows
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        
        const upcVal = row.getCell(upcCol).value?.toString() || '';
        const nameVal = row.getCell(nameCol).value?.toString() || '';
        const descVal = descCol > 0 ? row.getCell(descCol).value?.toString() || '' : '';
        
        const cleanedUPC = cleanUPC(upcVal);
        if (cleanedUPC) {
          const name = cleanName(nameVal || descVal);
          if (name.length > 2) {
            entries.push({ upc: cleanedUPC, name, source: fileName });
          }
        }
      });
    });
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err}`);
  }
  
  return entries;
}

async function main() {
  console.log('=== THOROUGH UPC EXTRACTION ===\n');
  
  const allUPCs = new Map<string, UPCEntry>();
  
  // Source 1: Maybe Inventory JSON (already extracted)
  console.log('1. Loading Maybe Inventory (maybe_upcs.json)...');
  if (fs.existsSync('maybe_upcs.json')) {
    const data: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
    for (const entry of data) {
      const cleanedUPC = cleanUPC(entry.upc);
      if (cleanedUPC && entry.name) {
        const existing = allUPCs.get(cleanedUPC);
        // Keep entry with longer/better name
        if (!existing || entry.name.length > existing.name.length) {
          allUPCs.set(cleanedUPC, { upc: cleanedUPC, name: cleanName(entry.name), source: 'maybe_inventory' });
        }
      }
    }
    console.log(`   Loaded: ${allUPCs.size} unique UPCs`);
  }
  
  // Source 2: All Excel files
  console.log('2. Extracting from Excel files...');
  const excelFiles = [
    'attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx',
    'attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx',
    'attached_assets/AnimalHouse_Exatouch_Import.xlsx',
    'attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx'
  ];
  
  for (const file of excelFiles) {
    if (fs.existsSync(file)) {
      const entries = await extractFromExcel(file);
      let added = 0;
      for (const entry of entries) {
        const existing = allUPCs.get(entry.upc);
        if (!existing || entry.name.length > existing.name.length) {
          allUPCs.set(entry.upc, entry);
          if (!existing) added++;
        }
      }
      console.log(`   ${file.split('/').pop()}: ${entries.length} entries, ${added} new UPCs`);
    }
  }
  console.log(`   Total after Excel: ${allUPCs.size} unique UPCs`);
  
  // Source 3: Verified UPCs from PDF extractions
  console.log('3. Loading verified UPCs (scripts/verified_upcs.json)...');
  if (fs.existsSync('scripts/verified_upcs.json')) {
    const data: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/verified_upcs.json', 'utf-8'));
    let added = 0;
    for (const entry of data) {
      const cleanedUPC = cleanUPC(entry.upc);
      if (cleanedUPC && entry.name) {
        const existing = allUPCs.get(cleanedUPC);
        if (!existing || entry.name.length > existing.name.length) {
          allUPCs.set(cleanedUPC, { upc: cleanedUPC, name: cleanName(entry.name), source: entry.source || 'pdf' });
          if (!existing) added++;
        }
      }
    }
    console.log(`   Added ${added} new UPCs (total: ${allUPCs.size})`);
  }
  
  // Source 4: Google Sheet CSV
  console.log('4. Loading Google Sheet CSV...');
  if (fs.existsSync('scripts/google_sheet_upcs.csv')) {
    const lines = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8').split('\n');
    let added = 0;
    for (const line of lines.slice(1)) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const cleanedUPC = cleanUPC(parts[0]);
        const name = cleanName(parts[1] || '');
        if (cleanedUPC && name.length > 2) {
          const existing = allUPCs.get(cleanedUPC);
          if (!existing || name.length > existing.name.length) {
            allUPCs.set(cleanedUPC, { upc: cleanedUPC, name, source: 'google_sheet' });
            if (!existing) added++;
          }
        }
      }
    }
    console.log(`   Added ${added} new UPCs (total: ${allUPCs.size})`);
  }
  
  // Source 5: CamScanner OCR
  console.log('5. Loading CamScanner UPCs...');
  if (fs.existsSync('scripts/camscanner_upcs.json')) {
    const data: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/camscanner_upcs.json', 'utf-8'));
    let added = 0;
    for (const entry of data) {
      const cleanedUPC = cleanUPC(entry.upc);
      if (cleanedUPC && entry.name) {
        const existing = allUPCs.get(cleanedUPC);
        if (!existing || entry.name.length > existing.name.length) {
          allUPCs.set(cleanedUPC, { upc: cleanedUPC, name: cleanName(entry.name), source: 'camscanner' });
          if (!existing) added++;
        }
      }
    }
    console.log(`   Added ${added} new UPCs (total: ${allUPCs.size})`);
  }
  
  // Save master list
  const masterList = Array.from(allUPCs.values());
  fs.writeFileSync('scripts/master_verified_upcs.json', JSON.stringify(masterList, null, 2));
  
  console.log(`\n=== MASTER LIST: ${masterList.length} unique UPCs ===`);
  
  // Count by source
  const bySrc = new Map<string, number>();
  for (const entry of masterList) {
    const src = entry.source.includes('_176') ? 'pdf_invoice' : entry.source;
    bySrc.set(src, (bySrc.get(src) || 0) + 1);
  }
  console.log('\nBy source:');
  for (const [src, count] of Array.from(bySrc.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src}: ${count}`);
  }
}

main().catch(console.error);
