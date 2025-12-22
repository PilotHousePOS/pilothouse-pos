import fs from 'fs';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
  format?: string;
}

// Load all UPC sources
console.log('=== COMBINING ALL UPC SOURCES ===\n');

// 1. Load verified UPCs (from PDFs and Google Sheet)
const verifiedPath = 'scripts/verified_upcs.json';
const verifiedUPCs: UPCEntry[] = JSON.parse(fs.readFileSync(verifiedPath, 'utf-8'));
console.log(`Verified UPCs (PDFs + Google Sheet): ${verifiedUPCs.length}`);

// 2. Load CamScanner OCR UPCs
const camScannerPath = 'scripts/camscanner_upcs.json';
const camScannerUPCs: UPCEntry[] = JSON.parse(fs.readFileSync(camScannerPath, 'utf-8'));
console.log(`CamScanner OCR UPCs: ${camScannerUPCs.length}`);

// Combine all
const allUPCs: UPCEntry[] = [...verifiedUPCs, ...camScannerUPCs];
console.log(`Total combined: ${allUPCs.length}`);

// Deduplicate - prefer sources in order: google_sheet > camscanner > pdf
const upcMap = new Map<string, UPCEntry>();

// Sort to prioritize: google_sheet first, then camscanner (better OCR names), then PDF
const sorted = allUPCs.sort((a, b) => {
  const priority = (entry: UPCEntry) => {
    if (entry.format === 'google_sheet') return 0;
    if (entry.source.includes('camscanner') || entry.source.includes('CamScanner')) return 1;
    return 2;
  };
  const pa = priority(a);
  const pb = priority(b);
  if (pa !== pb) return pa - pb;
  return b.name.length - a.name.length; // Longer names preferred
});

for (const entry of sorted) {
  const cleanUPC = entry.upc.replace(/[^0-9]/g, '').padStart(12, '0');
  if (!upcMap.has(cleanUPC) && entry.name && entry.name.length > 2) {
    upcMap.set(cleanUPC, {
      ...entry,
      upc: cleanUPC
    });
  }
}

const uniqueUPCs = Array.from(upcMap.values());
console.log(`\nUnique UPCs after dedup: ${uniqueUPCs.length}`);

// Save master list
const outputPath = 'scripts/master_verified_upcs.json';
fs.writeFileSync(outputPath, JSON.stringify(uniqueUPCs, null, 2));
console.log(`Saved to ${outputPath}`);

// Stats by source
const bySource = new Map<string, number>();
for (const entry of uniqueUPCs) {
  let source = 'pdf';
  if (entry.format === 'google_sheet') source = 'google_sheet';
  else if (entry.source.includes('CamScanner') || entry.source.includes('camscanner')) source = 'camscanner';
  else if (entry.format === 'order_format') source = 'order_format';
  else if (entry.format === 'central_pet') source = 'central_pet';
  bySource.set(source, (bySource.get(source) || 0) + 1);
}

console.log('\n=== BREAKDOWN BY SOURCE ===');
for (const [source, count] of bySource) {
  console.log(`  ${source}: ${count}`);
}

// Show samples
console.log('\n=== SAMPLES ===');
uniqueUPCs.slice(0, 10).forEach(u => {
  console.log(`${u.upc}: ${u.name}`);
});
