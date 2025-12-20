import fs from 'fs';
import ExcelJS from 'exceljs';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

async function extractFromExcel(filePath: string): Promise<UpcEntry[]> {
  const entries: UpcEntry[] = [];
  const workbook = new ExcelJS.Workbook();
  
  try {
    await workbook.xlsx.readFile(filePath);
    
    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // Skip header
        
        const values = row.values as any[];
        if (!values || values.length < 2) return;
        
        // Look for UPC-like values (10-14 digits) in each cell
        let upc = '';
        let name = '';
        
        for (let i = 1; i < values.length; i++) {
          const cell = values[i];
          if (!cell) continue;
          
          const cellStr = String(cell).trim();
          
          // Check if this looks like a UPC
          if (/^\d{10,14}$/.test(cellStr.replace(/\D/g, ''))) {
            const cleanUpc = cellStr.replace(/\D/g, '');
            if (cleanUpc.length >= 10 && cleanUpc.length <= 14) {
              upc = cleanUpc;
            }
          }
          // If it looks like a product name (has letters, reasonable length)
          else if (/[a-zA-Z]/.test(cellStr) && cellStr.length > 3 && cellStr.length < 200) {
            if (!name || cellStr.length > name.length) {
              name = cellStr;
            }
          }
        }
        
        if (upc && name) {
          entries.push({ upc, name, source: filePath });
        }
      });
    }
  } catch (err: any) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  
  return entries;
}

async function main() {
  const excelFiles = [
    "attached_assets/AnimalHouse_Exatouch_Import.xlsx",
    "attached_assets/AnimalHouse_Inventory_2025-12-04 (1)_1764877836470.xlsx",
    "attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx",
    "attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx"
  ];
  
  const allEntries: UpcEntry[] = [];
  
  for (const file of excelFiles) {
    if (fs.existsSync(file)) {
      console.log(`Processing: ${file}`);
      const entries = await extractFromExcel(file);
      console.log(`  Found ${entries.length} UPC entries`);
      allEntries.push(...entries);
    } else {
      console.log(`File not found: ${file}`);
    }
  }
  
  console.log(`\nTotal entries extracted: ${allEntries.length}`);
  
  // Deduplicate by UPC, keeping longest name
  const upcMap = new Map<string, UpcEntry>();
  for (const entry of allEntries) {
    const existing = upcMap.get(entry.upc);
    if (!existing || entry.name.length > existing.name.length) {
      upcMap.set(entry.upc, entry);
    }
  }
  
  const unique = Array.from(upcMap.values());
  console.log(`Unique UPCs: ${unique.length}`);
  
  fs.writeFileSync('.local/state/memory/all_excel_upcs.json', JSON.stringify(unique, null, 2));
  console.log('Saved to .local/state/memory/all_excel_upcs.json');
  
  // Show sample
  console.log('\nSample entries:');
  unique.slice(0, 5).forEach(e => console.log(`  ${e.upc}: ${e.name.substring(0, 50)}`));
}

main().catch(console.error);
