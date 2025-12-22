import fs from 'fs';

console.log('=== REBUILDING MASTER UPC INDEX ===\n');

// Load all source data
const combined = JSON.parse(fs.readFileSync('scripts/all_combined_upcs.json'));
const verified = JSON.parse(fs.readFileSync('scripts/master_verified_upcs.json'));

console.log('Combined entries:', combined.length);
console.log('Verified entries:', verified.length);

// Priority: 
// 1. Use verified first (more accurate)
// 2. Then combined
// 3. Resolve conflicts by name similarity

const upcIndex = new Map();

// Add verified entries first (higher priority)
for (const e of verified) {
  if (!e.upc || !e.name) continue;
  if (!upcIndex.has(e.upc)) {
    upcIndex.set(e.upc, {
      upc: e.upc,
      name: e.name,
      source: 'verified',
      isCoastal: e.name.toLowerCase().includes('coastal')
    });
  }
}
console.log('After verified:', upcIndex.size);

// Add combined entries (only if UPC not already set)
for (const e of combined) {
  if (!e.upc || !e.name) continue;
  if (!upcIndex.has(e.upc)) {
    upcIndex.set(e.upc, {
      upc: e.upc,
      name: e.name,
      source: 'combined',
      isCoastal: e.name.toLowerCase().includes('coastal')
    });
  }
}
console.log('After combined:', upcIndex.size);

// Check for specific brands
const brands = ['oxbow', 'benebone', 'smartbone', 'barkworth'];
for (const brand of brands) {
  const matches = Array.from(upcIndex.values()).filter(e => 
    e.name.toLowerCase().includes(brand)
  );
  console.log(`  ${brand}: ${matches.length} entries`);
}

// Convert to array
const entries = Array.from(upcIndex.values());

// Count Coastal vs non-Coastal
const coastal = entries.filter(e => e.isCoastal).length;
const nonCoastal = entries.length - coastal;

const master = {
  createdAt: new Date().toISOString(),
  nonCoastalUpcs: nonCoastal,
  coastalUpcs: coastal,
  totalUniqueUpcs: entries.length,
  totalEntries: entries.length,
  entries
};

fs.writeFileSync('scripts/master_upc_index.json', JSON.stringify(master, null, 2));
console.log('\nSaved master with', entries.length, 'entries');
