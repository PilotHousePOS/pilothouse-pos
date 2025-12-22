import fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

function cleanUPC(upc: string): string {
  return upc.replace(/[^0-9]/g, '').padStart(12, '0');
}

async function main() {
  console.log('=== COMPREHENSIVE UPC COMBINATION ===\n');
  
  const allUPCs = new Map<string, UPCEntry>();
  const stats: Record<string, number> = {};
  
  // Source 1: Maybe Inventory (7,322 UPCs)
  console.log('1. Loading Maybe Inventory (maybe_upcs.json)...');
  if (fs.existsSync('maybe_upcs.json')) {
    const data: UPCEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
    let added = 0;
    for (const entry of data) {
      const cleanedUPC = cleanUPC(entry.upc);
      if (cleanedUPC.length >= 10 && !allUPCs.has(cleanedUPC)) {
        allUPCs.set(cleanedUPC, { upc: cleanedUPC, name: entry.name, source: 'maybe_inventory' });
        added++;
      }
    }
    stats['maybe_inventory'] = added;
    console.log(`   Added: ${added} unique UPCs (total: ${allUPCs.size})`);
  }
  
  // Source 2: Verified UPCs from previous extractions
  console.log('2. Loading Verified UPCs (scripts/verified_upcs.json)...');
  if (fs.existsSync('scripts/verified_upcs.json')) {
    const data: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/verified_upcs.json', 'utf-8'));
    let added = 0;
    for (const entry of data) {
      const cleanedUPC = cleanUPC(entry.upc);
      if (cleanedUPC.length >= 10 && !allUPCs.has(cleanedUPC)) {
        allUPCs.set(cleanedUPC, { upc: cleanedUPC, name: entry.name, source: entry.source || 'verified' });
        added++;
      }
    }
    stats['verified_upcs'] = added;
    console.log(`   Added: ${added} new UPCs (total: ${allUPCs.size})`);
  }
  
  // Source 3: Google Sheet CSV
  console.log('3. Loading Google Sheet (scripts/google_sheet_upcs.csv)...');
  if (fs.existsSync('scripts/google_sheet_upcs.csv')) {
    const lines = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8').split('\n');
    let added = 0;
    for (const line of lines.slice(1)) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const cleanedUPC = cleanUPC(parts[0]);
        const name = parts[1]?.trim() || '';
        if (cleanedUPC.length >= 10 && !allUPCs.has(cleanedUPC)) {
          allUPCs.set(cleanedUPC, { upc: cleanedUPC, name, source: 'google_sheet' });
          added++;
        }
      }
    }
    stats['google_sheet'] = added;
    console.log(`   Added: ${added} new UPCs (total: ${allUPCs.size})`);
  }
  
  // Source 4: CamScanner OCR
  console.log('4. Loading CamScanner UPCs (scripts/camscanner_upcs.json)...');
  if (fs.existsSync('scripts/camscanner_upcs.json')) {
    const data: UPCEntry[] = JSON.parse(fs.readFileSync('scripts/camscanner_upcs.json', 'utf-8'));
    let added = 0;
    for (const entry of data) {
      const cleanedUPC = cleanUPC(entry.upc);
      if (cleanedUPC.length >= 10 && !allUPCs.has(cleanedUPC)) {
        allUPCs.set(cleanedUPC, { upc: cleanedUPC, name: entry.name, source: 'camscanner' });
        added++;
      }
    }
    stats['camscanner'] = added;
    console.log(`   Added: ${added} new UPCs (total: ${allUPCs.size})`);
  }
  
  // Source 5: Excel inventory UPCs
  console.log('5. Loading Excel Inventory UPCs (.local/state/memory/excel_inventory_upcs.json)...');
  if (fs.existsSync('.local/state/memory/excel_inventory_upcs.json')) {
    const data: UPCEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/excel_inventory_upcs.json', 'utf-8'));
    let added = 0;
    for (const entry of data) {
      const cleanedUPC = cleanUPC(entry.upc);
      if (cleanedUPC.length >= 10 && !allUPCs.has(cleanedUPC)) {
        allUPCs.set(cleanedUPC, { upc: cleanedUPC, name: entry.name, source: 'excel_inventory' });
        added++;
      }
    }
    stats['excel_inventory'] = added;
    console.log(`   Added: ${added} new UPCs (total: ${allUPCs.size})`);
  }
  
  // Source 6: All PDF text files that were already extracted
  console.log('6. Loading extracted PDF text files from attached_assets...');
  const txtFiles = fs.readdirSync('attached_assets').filter(f => f.endsWith('.txt') && !f.includes('unmatched'));
  let pdfAdded = 0;
  for (const txtFile of txtFiles) {
    try {
      const content = fs.readFileSync(`attached_assets/${txtFile}`, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        // Extract 10-14 digit numbers as potential UPCs
        const upcMatches = line.match(/\b(\d{10,14})\b/g);
        if (upcMatches) {
          for (const match of upcMatches) {
            // Skip dates and other non-UPC patterns
            if (/^\d{8}$/.test(match) || /^20\d{6}/.test(match)) continue;
            
            const cleanedUPC = cleanUPC(match);
            if (cleanedUPC.length >= 10 && !allUPCs.has(cleanedUPC)) {
              // Extract name from the line
              let name = line.replace(match, '').trim();
              name = name.replace(/\$[\d,.]+/g, '').replace(/\s+/g, ' ').trim();
              if (name.length < 3) name = txtFile.replace('.txt', '');
              
              allUPCs.set(cleanedUPC, { upc: cleanedUPC, name, source: txtFile });
              pdfAdded++;
            }
          }
        }
      }
    } catch (err) {
      // Skip files that can't be read
    }
  }
  stats['pdf_text_files'] = pdfAdded;
  console.log(`   Added: ${pdfAdded} new UPCs from ${txtFiles.length} text files (total: ${allUPCs.size})`);
  
  // Save complete master list
  const masterList = Array.from(allUPCs.values());
  fs.writeFileSync('scripts/master_verified_upcs.json', JSON.stringify(masterList, null, 2));
  
  console.log('\n=== SUMMARY ===');
  console.log(`Total unique UPCs: ${masterList.length}`);
  console.log('\nBy source:');
  for (const [source, count] of Object.entries(stats)) {
    console.log(`  ${source}: ${count}`);
  }
}

main().catch(console.error);
