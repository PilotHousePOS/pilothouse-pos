import fs from 'fs';
import path from 'path';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

const allUPCs: UPCEntry[] = [];

// UPC validation - must be 12-14 digits or valid EAN
function isValidUPC(code: string): boolean {
  const cleaned = code.replace(/[^0-9]/g, '');
  return cleaned.length >= 10 && cleaned.length <= 14;
}

function cleanUPC(code: string): string {
  return code.replace(/[^0-9]/g, '').padStart(12, '0');
}

// 1. SCAN GOOGLE SHEET CSV
console.log('=== SCANNING GOOGLE SHEET ===');
const csvPath = 'scripts/google_sheet_upcs.csv';
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const csvLines = csvContent.split('\n');

for (let i = 1; i < csvLines.length; i++) {
  const line = csvLines[i].trim();
  if (!line) continue;
  
  // Parse CSV - first field is UPC, second is name
  const match = line.match(/^(\d+),(.+?)(?:,|$)/);
  if (match) {
    const upc = match[1];
    const name = match[2].trim();
    if (isValidUPC(upc) && name) {
      allUPCs.push({
        upc: cleanUPC(upc),
        name: name,
        source: 'google_sheet'
      });
    }
  }
}
console.log(`Google Sheet: Found ${allUPCs.filter(u => u.source === 'google_sheet').length} UPCs`);

// 2. SCAN ALL EXTRACTED PDF TEXT FILES
console.log('\n=== SCANNING ALL PDF EXTRACTIONS ===');
const extractedDir = 'attached_assets/extracted_new';
const textFiles = fs.readdirSync(extractedDir).filter(f => f.endsWith('.txt'));

console.log(`Found ${textFiles.length} extracted text files to scan`);

// Multiple patterns to catch UPCs in different invoice formats
const upcPatterns = [
  // Pattern: UPC followed by description
  /\b(\d{10,14})\s+([A-Z][A-Za-z0-9\s\-\/\.\,\#\&\'\+\(\)]+?)(?:\s+\d+\.\d{2}|\s+EA|\s*$)/gm,
  // Pattern: Item code then UPC
  /(?:Item|SKU|Code)[:\s#]*\d*\s*(\d{12,14})\s+(.+?)(?:\s+\$?\d|$)/gim,
  // Pattern: UPC at start of line with product name
  /^(\d{12,14})\s+([A-Z][^\n\r]{5,60})/gm,
  // Pattern: Tabular format - UPC | Name | Price
  /(\d{12,14})\s+([A-Z][A-Za-z0-9\s\-\/\.\']+?)\s+\d+\s+[\$]?\d+\.\d{2}/gm,
];

let pdfUpcCount = 0;
for (const file of textFiles) {
  const content = fs.readFileSync(path.join(extractedDir, file), 'utf-8');
  
  // Try all patterns
  for (const pattern of upcPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const upc = match[1];
      let name = match[2].trim();
      
      // Clean up name
      name = name.replace(/\s+/g, ' ').trim();
      
      // Skip if name is too short or looks like a number
      if (name.length < 3 || /^\d+$/.test(name)) continue;
      
      if (isValidUPC(upc)) {
        allUPCs.push({
          upc: cleanUPC(upc),
          name: name,
          source: `pdf:${file}`
        });
        pdfUpcCount++;
      }
    }
  }
  
  // Also look for standalone UPCs (12-14 digit numbers)
  const standalonePattern = /\b(\d{12,14})\b/g;
  let standalone;
  while ((standalone = standalonePattern.exec(content)) !== null) {
    const upc = standalone[1];
    // Look for text near the UPC (within 100 chars before or after)
    const pos = standalone.index;
    const context = content.substring(Math.max(0, pos - 100), Math.min(content.length, pos + 100));
    
    // Try to extract a product name from context
    const nameMatch = context.match(/([A-Z][A-Za-z0-9\s\-\/\.\']{5,50})/);
    if (nameMatch && isValidUPC(upc)) {
      const name = nameMatch[1].trim();
      allUPCs.push({
        upc: cleanUPC(upc),
        name: name,
        source: `pdf:${file}:standalone`
      });
    }
  }
}
console.log(`PDF Extractions: Found ${pdfUpcCount} UPCs from patterns`);

// 3. DEDUPLICATE - Keep unique UPC+name combinations
console.log('\n=== DEDUPLICATING ===');
const uniqueMap = new Map<string, UPCEntry>();

for (const entry of allUPCs) {
  const key = `${entry.upc}`;
  if (!uniqueMap.has(key)) {
    uniqueMap.set(key, entry);
  }
}

const uniqueUPCs = Array.from(uniqueMap.values());
console.log(`Total after dedup: ${uniqueUPCs.length} unique UPCs`);

// 4. Save verified UPCs
const outputPath = 'scripts/verified_upcs.json';
fs.writeFileSync(outputPath, JSON.stringify(uniqueUPCs, null, 2));
console.log(`\nSaved ${uniqueUPCs.length} verified UPCs to ${outputPath}`);

// 5. Show sample
console.log('\n=== SAMPLE UPCs ===');
uniqueUPCs.slice(0, 10).forEach(u => {
  console.log(`${u.upc}: ${u.name} (${u.source})`);
});

// 6. Check for potential duplicates (same UPC, different products)
console.log('\n=== CHECKING FOR DUPLICATE UPC ISSUES ===');
const upcToNames = new Map<string, Set<string>>();
for (const entry of allUPCs) {
  if (!upcToNames.has(entry.upc)) {
    upcToNames.set(entry.upc, new Set());
  }
  upcToNames.get(entry.upc)!.add(entry.name);
}

let duplicateIssues = 0;
for (const [upc, names] of upcToNames) {
  if (names.size > 1) {
    // Check if these are size/color variants of same product (acceptable)
    const nameArray = Array.from(names);
    const isVariant = nameArray.every(n => {
      const baseName = nameArray[0].toLowerCase().replace(/\d+(\.\d+)?(#|oz|lb|ml|g|kg|ct|pk|pack)?/gi, '').trim();
      const thisBase = n.toLowerCase().replace(/\d+(\.\d+)?(#|oz|lb|ml|g|kg|ct|pk|pack)?/gi, '').trim();
      // Similar base names (at least 60% match)
      const words1 = baseName.split(/\s+/);
      const words2 = thisBase.split(/\s+/);
      const commonWords = words1.filter(w => words2.includes(w)).length;
      return commonWords >= Math.min(words1.length, words2.length) * 0.6;
    });
    
    if (!isVariant) {
      duplicateIssues++;
      if (duplicateIssues <= 5) {
        console.log(`\nPotential issue - UPC ${upc} has different products:`);
        names.forEach(n => console.log(`  - ${n}`));
      }
    }
  }
}
console.log(`\nFound ${duplicateIssues} potential duplicate UPC issues`);
