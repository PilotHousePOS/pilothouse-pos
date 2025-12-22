import * as fs from "fs";
import { expandAbbreviations } from "../server/abbreviationExpansion";

/**
 * Build an enriched master UPC index that:
 * 1. Combines all UPC sources
 * 2. Adds context (source, brand from UPC prefix)
 * 3. Expands all abbreviations
 * 4. Deduplicates by UPC, keeping the best name
 */

// UPC prefix to brand mapping
const UPC_PREFIX_BRANDS: Record<string, string> = {
  '030172': 'Penn-Plax',
  '097612': 'Zoo Med',
  '015561': 'Fluval',
  '046798': 'Tetra',
  '042055': 'Hikari',
  '076484': 'Coastal',
  '045663': 'Four Paws',
  '077234': 'API',
  '785184': 'Red Barn',
  '071860': 'Ark Naturals',
  '030027': 'Acme',
  '041693': 'Kaytee',
  '017800': 'Zilla',
  '015905': 'Marineland',
  '090653': 'Exo Terra',
  '073725': 'Greenies',
  '070672': 'Benebone',
  '844249': 'Oxbow',
  '019014': 'Nylabone',
  '018214': 'Wellness',
  '064992': 'Merrick',
  '769949': 'Acana',
  '064863': 'Orijen',
  '074198': 'Dogswell',
  '618940': 'Victor',
  '840243': 'Diamond',
  '730521': 'Canidae',
  '023100': 'Purina',
  '052742': 'Hills',
  '079105': 'Royal Canin',
  '019014': 'Nylabone',
  '041334': 'JW Pet',
  '743723': 'Starmark',
  '087502': 'Coastal Pet',
  '076344': 'Fashion Pet',
  '077234': 'API',
  '043156': 'Hartz',
  '014891': 'Adams',
  '041220': 'Sergeant',
  '085715': 'Advantage',
  '043917': 'Frontline',
  '083706': 'Midwest',
  '027773': 'Petmate',
  '029695': 'Van Ness',
  '072053': 'Doskocil',
  '014891': 'Adams',
};

interface RawEntry {
  upc: string;
  name: string;
  source?: string;
  isCoastal?: boolean;
}

interface EnrichedEntry {
  upc: string;
  originalName: string;
  expandedName: string;
  source: string;
  inferredBrand: string;
  isCoastal: boolean;
  nameQuality: number; // Higher = better (more complete name)
}

function calculateNameQuality(name: string, inferredBrand: string): number {
  let score = 0;
  const lowerName = name.toLowerCase();
  
  // Bonus for having brand name in the product name
  if (inferredBrand && lowerName.includes(inferredBrand.toLowerCase().split(' ')[0])) {
    score += 20;
  }
  
  // Bonus for longer names (more descriptive)
  score += Math.min(name.length / 5, 15);
  
  // Bonus for having size info
  if (/\b(small|medium|large|mini|xs|xl|oz|lb|inch|pack)\b/i.test(name)) {
    score += 5;
  }
  
  // Penalty for heavy abbreviations (many uppercase words)
  const words = name.split(/\s+/);
  const allCapsWords = words.filter(w => /^[A-Z]{2,}$/.test(w)).length;
  score -= allCapsWords * 2;
  
  // Penalty for periods (likely abbreviations)
  score -= (name.match(/\./g) || []).length * 2;
  
  return score;
}

async function main() {
  console.log("=== BUILDING ENRICHED MASTER UPC INDEX ===\n");
  
  const allEntries: EnrichedEntry[] = [];
  
  // Load master UPC index
  console.log("1. Loading master_upc_index.json...");
  const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));
  console.log(`   Loaded ${masterData.entries.length} entries`);
  
  for (const entry of masterData.entries) {
    const prefix = entry.upc.slice(0, 6);
    const inferredBrand = UPC_PREFIX_BRANDS[prefix] || '';
    const expandedName = expandAbbreviations(entry.name || '');
    
    allEntries.push({
      upc: entry.upc,
      originalName: entry.name || '',
      expandedName,
      source: entry.source || 'master_index',
      inferredBrand,
      isCoastal: entry.isCoastal || entry.name?.toLowerCase().includes('coastal') || false,
      nameQuality: calculateNameQuality(entry.name || '', inferredBrand)
    });
  }
  
  // Load CamScanner UPCs
  console.log("2. Loading camscanner_upcs.json...");
  try {
    const camData = JSON.parse(fs.readFileSync('scripts/camscanner_upcs.json', 'utf-8'));
    const camEntries = Array.isArray(camData) ? camData : camData.entries || [];
    console.log(`   Loaded ${camEntries.length} entries`);
    
    for (const entry of camEntries) {
      const prefix = entry.upc.slice(0, 6);
      const inferredBrand = UPC_PREFIX_BRANDS[prefix] || '';
      const expandedName = expandAbbreviations(entry.name || '');
      
      allEntries.push({
        upc: entry.upc,
        originalName: entry.name || '',
        expandedName,
        source: entry.source || 'camscanner',
        inferredBrand,
        isCoastal: entry.name?.toLowerCase().includes('coastal') || false,
        nameQuality: calculateNameQuality(entry.name || '', inferredBrand)
      });
    }
  } catch (e) {
    console.log(`   Error loading camscanner: ${e}`);
  }
  
  // Load PDF OCR UPCs
  console.log("3. Loading pdf_ocr_upcs.json...");
  try {
    const pdfData = JSON.parse(fs.readFileSync('scripts/pdf_ocr_upcs.json', 'utf-8'));
    const pdfEntries = Array.isArray(pdfData) ? pdfData : pdfData.entries || [];
    console.log(`   Loaded ${pdfEntries.length} entries`);
    
    for (const entry of pdfEntries) {
      const prefix = entry.upc.slice(0, 6);
      const inferredBrand = UPC_PREFIX_BRANDS[prefix] || '';
      const expandedName = expandAbbreviations(entry.name || '');
      
      allEntries.push({
        upc: entry.upc,
        originalName: entry.name || '',
        expandedName,
        source: entry.source || 'pdf_ocr',
        inferredBrand,
        isCoastal: entry.name?.toLowerCase().includes('coastal') || false,
        nameQuality: calculateNameQuality(entry.name || '', inferredBrand)
      });
    }
  } catch (e) {
    console.log(`   Error loading pdf_ocr: ${e}`);
  }
  
  // Load verified UPCs
  console.log("4. Loading verified_upcs.json...");
  try {
    const verifiedData = JSON.parse(fs.readFileSync('scripts/verified_upcs.json', 'utf-8'));
    const verifiedEntries = Array.isArray(verifiedData) ? verifiedData : verifiedData.entries || [];
    console.log(`   Loaded ${verifiedEntries.length} entries`);
    
    for (const entry of verifiedEntries) {
      const prefix = entry.upc.slice(0, 6);
      const inferredBrand = UPC_PREFIX_BRANDS[prefix] || '';
      const expandedName = expandAbbreviations(entry.name || '');
      
      allEntries.push({
        upc: entry.upc,
        originalName: entry.name || '',
        expandedName,
        source: 'verified',
        inferredBrand,
        isCoastal: entry.name?.toLowerCase().includes('coastal') || false,
        nameQuality: calculateNameQuality(entry.name || '', inferredBrand) + 10 // Bonus for verified
      });
    }
  } catch (e) {
    console.log(`   Error loading verified: ${e}`);
  }
  
  // Deduplicate by UPC, keeping the entry with highest name quality
  console.log("\n5. Deduplicating by UPC (keeping best name)...");
  const upcMap = new Map<string, EnrichedEntry>();
  
  for (const entry of allEntries) {
    const existing = upcMap.get(entry.upc);
    if (!existing || entry.nameQuality > existing.nameQuality) {
      upcMap.set(entry.upc, entry);
    }
  }
  
  const dedupedEntries = Array.from(upcMap.values());
  console.log(`   Total entries: ${allEntries.length}`);
  console.log(`   Unique UPCs: ${dedupedEntries.length}`);
  
  // Stats by source
  const bySource: Record<string, number> = {};
  dedupedEntries.forEach(e => {
    bySource[e.source] = (bySource[e.source] || 0) + 1;
  });
  console.log("\n   By source:");
  Object.entries(bySource).forEach(([k, v]) => console.log(`     ${k}: ${v}`));
  
  // Stats by inferred brand
  const byBrand: Record<string, number> = {};
  dedupedEntries.forEach(e => {
    if (e.inferredBrand) {
      byBrand[e.inferredBrand] = (byBrand[e.inferredBrand] || 0) + 1;
    }
  });
  console.log("\n   By inferred brand (top 15):");
  Object.entries(byBrand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([k, v]) => console.log(`     ${k}: ${v}`));
  
  // Save enriched index
  console.log("\n6. Saving enriched index...");
  const output = {
    generatedAt: new Date().toISOString(),
    totalEntries: dedupedEntries.length,
    bySource,
    byBrand,
    entries: dedupedEntries
  };
  
  fs.writeFileSync('scripts/enriched_upc_index.json', JSON.stringify(output, null, 2));
  console.log("   Saved to scripts/enriched_upc_index.json");
  
  console.log("\n=== ENRICHED INDEX COMPLETE ===");
}

main().catch(console.error);
