import * as fs from 'fs';

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
  isCoastal: boolean;
}

async function consolidate() {
  console.log("=== CONSOLIDATING ALL UPC SOURCES (FIXED) ===\n");
  
  // Separate storage for Coastal and non-Coastal
  const nonCoastalUpcs: Map<string, UpcEntry> = new Map(); // Only one entry per UPC
  const coastalUpcs: Map<string, UpcEntry[]> = new Map();  // Multiple entries per UPC allowed
  
  function addEntry(upc: string, name: string, source: string) {
    // Clean UPC - must be numeric only
    upc = upc.replace(/[^\d]/g, '');
    if (!/^\d{8,14}$/.test(upc)) return;
    if (!name || name.length < 3) return;
    
    const normalizedName = name.toLowerCase();
    const isCoastal = normalizedName.includes('coastal');
    
    if (isCoastal) {
      // Coastal: allow multiple entries per UPC (different sizes/colors)
      if (!coastalUpcs.has(upc)) {
        coastalUpcs.set(upc, []);
      }
      const existing = coastalUpcs.get(upc)!;
      // Check if this exact name already exists
      const nameKey = normalizedName.replace(/[^a-z0-9]/g, '');
      const nameExists = existing.some(e => 
        e.name.toLowerCase().replace(/[^a-z0-9]/g, '') === nameKey
      );
      if (!nameExists) {
        existing.push({ upc, name, source, isCoastal: true });
      }
    } else {
      // Non-Coastal: only keep first entry per UPC
      if (!nonCoastalUpcs.has(upc)) {
        nonCoastalUpcs.set(upc, { upc, name, source, isCoastal: false });
      }
    }
  }
  
  // 1. Load filtered Maybe inventory FIRST (most reliable source)
  console.log("1. Loading Maybe inventory (priority source)...");
  const maybeData = JSON.parse(fs.readFileSync('scripts/filtered_maybe_upcs.json', 'utf-8'));
  for (const entry of maybeData.entries) {
    addEntry(entry.upc, entry.name, 'maybe_inventory');
  }
  console.log(`   Processed: ${maybeData.entries.length}\n`);
  
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
  console.log(`   Processed: ${pdfCount}\n`);
  
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
  console.log(`   Processed: ${catalogCount}\n`);
  
  // 4. Load combined UPCs
  if (fs.existsSync('scripts/all_combined_upcs.json')) {
    console.log("4. Loading combined UPCs...");
    const combined = JSON.parse(fs.readFileSync('scripts/all_combined_upcs.json', 'utf-8'));
    let combinedCount = 0;
    for (const entry of combined) {
      addEntry(entry.upc, entry.name, entry.source || 'combined');
      combinedCount++;
    }
    console.log(`   Processed: ${combinedCount}\n`);
  }
  
  // Calculate stats
  let coastalCount = 0;
  for (const entries of coastalUpcs.values()) {
    coastalCount += entries.length;
  }
  
  console.log("=== MASTER INDEX STATS ===");
  console.log(`Non-Coastal unique UPCs: ${nonCoastalUpcs.size}`);
  console.log(`Coastal unique UPCs: ${coastalUpcs.size}`);
  console.log(`Coastal total entries (with variants): ${coastalCount}`);
  console.log(`TOTAL unique UPCs: ${nonCoastalUpcs.size + coastalUpcs.size}`);
  
  // Merge into single output
  const allEntries: UpcEntry[] = [];
  for (const entry of nonCoastalUpcs.values()) {
    allEntries.push(entry);
  }
  for (const entries of coastalUpcs.values()) {
    allEntries.push(...entries);
  }
  
  // Save master index
  const output = {
    createdAt: new Date().toISOString(),
    nonCoastalUpcs: nonCoastalUpcs.size,
    coastalUpcs: coastalUpcs.size,
    totalUniqueUpcs: nonCoastalUpcs.size + coastalUpcs.size,
    totalEntries: allEntries.length,
    entries: allEntries
  };
  
  fs.writeFileSync('scripts/master_upc_index.json', JSON.stringify(output, null, 2));
  console.log(`\nSaved ${allEntries.length} entries to scripts/master_upc_index.json`);
  
  // Show sample Coastal entries with variants
  console.log("\nSample Coastal UPCs with variants:");
  let count = 0;
  for (const [upc, entries] of coastalUpcs) {
    if (entries.length > 1 && count < 5) {
      console.log(`  ${upc}: ${entries.length} variants`);
      for (const e of entries.slice(0, 3)) {
        console.log(`    - ${e.name}`);
      }
      count++;
    }
  }
  
  // Show sample non-Coastal entries
  console.log("\nSample non-Coastal entries:");
  const nonCoastalSamples = Array.from(nonCoastalUpcs.values()).slice(0, 5);
  for (const e of nonCoastalSamples) {
    console.log(`  ${e.upc} -> ${e.name}`);
  }
}

consolidate().catch(console.error);
