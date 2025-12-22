import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  name: string;
  brand?: string;
  source: string;
  isCoastal: boolean;
}

async function consolidate() {
  console.log("=== CONSOLIDATING ALL UPC SOURCES ===\n");
  
  const masterIndex: Map<string, UpcEntry[]> = new Map();
  
  function addEntry(upc: string, name: string, source: string, brand?: string) {
    // Clean UPC
    upc = upc.replace(/[^\d]/g, '');
    if (upc.length < 8 || upc.length > 14) return;
    if (!name || name.length < 3) return;
    
    const isCoastal = name.toLowerCase().includes('coastal');
    const entry: UpcEntry = { upc, name, source, brand, isCoastal };
    
    if (!masterIndex.has(upc)) {
      masterIndex.set(upc, []);
    }
    
    // For Coastal: allow multiple entries per UPC (different sizes/colors)
    // For others: only keep first entry
    const existing = masterIndex.get(upc)!;
    if (isCoastal || existing.length === 0) {
      // Check if this exact name already exists
      const nameExists = existing.some(e => 
        e.name.toLowerCase().replace(/[^a-z0-9]/g, '') === name.toLowerCase().replace(/[^a-z0-9]/g, '')
      );
      if (!nameExists) {
        existing.push(entry);
      }
    }
  }
  
  // 1. Load filtered Maybe inventory
  console.log("1. Loading Maybe inventory...");
  const maybeData = JSON.parse(fs.readFileSync('scripts/filtered_maybe_upcs.json', 'utf-8'));
  for (const entry of maybeData.entries) {
    addEntry(entry.upc, entry.name, 'maybe_inventory');
  }
  console.log(`   Added from Maybe: ${maybeData.entries.length}\n`);
  
  // 2. Load PDF extractions
  console.log("2. Loading PDF extractions...");
  const pdfData = JSON.parse(fs.readFileSync('scripts/pdf_extractions_db.json', 'utf-8'));
  let pdfCount = 0;
  for (const extraction of pdfData.extractions) {
    for (const item of extraction.items) {
      addEntry(item.upc, item.name, 'pdf_invoice');
      pdfCount++;
    }
  }
  console.log(`   Added from PDFs: ${pdfCount}\n`);
  
  // 3. Load UPC catalog
  console.log("3. Loading UPC catalog...");
  const catalogData = JSON.parse(fs.readFileSync('scripts/upc_catalog.json', 'utf-8'));
  let catalogCount = 0;
  for (const entry of catalogData.entries) {
    for (const name of entry.names) {
      addEntry(entry.upc, name, 'catalog');
      catalogCount++;
    }
  }
  console.log(`   Added from catalog: ${catalogCount}\n`);
  
  // 4. Load combined UPCs if exists
  if (fs.existsSync('scripts/all_combined_upcs.json')) {
    console.log("4. Loading combined UPCs...");
    const combined = JSON.parse(fs.readFileSync('scripts/all_combined_upcs.json', 'utf-8'));
    let combinedCount = 0;
    for (const entry of combined) {
      addEntry(entry.upc, entry.name, entry.source || 'combined');
      combinedCount++;
    }
    console.log(`   Added from combined: ${combinedCount}\n`);
  }
  
  // Calculate stats
  let totalEntries = 0;
  let coastalEntries = 0;
  for (const entries of masterIndex.values()) {
    totalEntries += entries.length;
    coastalEntries += entries.filter(e => e.isCoastal).length;
  }
  
  console.log("=== MASTER INDEX STATS ===");
  console.log(`Unique UPCs: ${masterIndex.size}`);
  console.log(`Total entries (with Coastal variants): ${totalEntries}`);
  console.log(`Coastal entries: ${coastalEntries}`);
  
  // Convert to array for saving
  const outputEntries: UpcEntry[] = [];
  for (const entries of masterIndex.values()) {
    outputEntries.push(...entries);
  }
  
  // Save master index
  const output = {
    createdAt: new Date().toISOString(),
    uniqueUpcs: masterIndex.size,
    totalEntries: outputEntries.length,
    coastalEntries,
    entries: outputEntries
  };
  
  fs.writeFileSync('scripts/master_upc_index.json', JSON.stringify(output, null, 2));
  console.log(`\nSaved to scripts/master_upc_index.json`);
  
  // Show sample entries
  console.log("\nSample entries:");
  let count = 0;
  for (const [upc, entries] of masterIndex) {
    if (count >= 10) break;
    if (entries.length > 1) {
      console.log(`  ${upc}: ${entries.length} variants`);
      for (const e of entries.slice(0, 3)) {
        console.log(`    - ${e.name} (${e.source})`);
      }
      count++;
    }
  }
}

consolidate().catch(console.error);
