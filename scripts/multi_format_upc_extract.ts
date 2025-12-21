import fs from 'fs';
import path from 'path';

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
  format: string;
}

const allUPCs: UPCEntry[] = [];

function isValidUPC(code: string): boolean {
  const cleaned = code.replace(/[^0-9]/g, '');
  return cleaned.length >= 10 && cleaned.length <= 14;
}

function cleanUPC(code: string): string {
  return code.replace(/[^0-9]/g, '').padStart(12, '0');
}

function cleanDescription(desc: string): string {
  return desc
    .replace(/\s+/g, ' ')
    .replace(/^[\d\s\/]+/, '')
    .replace(/\s*EA\s*$/i, '')
    .trim();
}

function isValidDescription(desc: string): boolean {
  if (!desc || desc.length < 3) return false;
  if (/^\d+$/.test(desc)) return false;
  if (!/[A-Za-z]{2,}/.test(desc)) return false;
  if (/^\s*(EA|UM|QTY|NET|LIST|CDE|OV|EXTENDED|SHIPPED|ORDER|PRODUCT|NUMBER|UPC|DESCRIPTION)\s*$/i.test(desc)) return false;
  if (/^\d+[\.\d]*$/.test(desc)) return false; // Just numbers with decimals
  return true;
}

function detectFormat(content: string): string {
  if (content.includes('CENTRAL PET DALLAS') || content.includes('REMIT TO ADDRESS')) {
    return 'central_pet';
  }
  if (content.includes('Order#') || content.includes('eorder.pennplax')) {
    return 'order_format';
  }
  if (content.includes('CamScanner')) {
    return 'camscanner';
  }
  return 'generic';
}

// Order format parser (PennPlax orders)
function parseOrderFormat(content: string, filename: string): UPCEntry[] {
  const results: UPCEntry[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Pattern: Product name with UPC inline like "Cascade™ Carbon Infused Media Pad 10\" x 18\" 030172082245 $3.85"
    const match = line.match(/^(.+?)\s+(\d{12,14})\s+\$[\d\.]+/);
    if (match) {
      const name = cleanDescription(match[1]);
      const upc = match[2];
      if (isValidDescription(name) && isValidUPC(upc)) {
        results.push({
          upc: cleanUPC(upc),
          name: name,
          source: filename,
          format: 'order_format'
        });
      }
    }
  }
  
  return results;
}

// Central Pet invoice parser - fields are on separate lines
function parseCentralPet(content: string, filename: string): UPCEntry[] {
  const results: UPCEntry[] = [];
  
  // Split into lines, filter empties and whitespace-only
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this line is a UPC (12-14 digit number)
    if (/^\d{12,14}$/.test(line)) {
      const upc = line;
      
      // Look at next line for description
      if (i + 1 < lines.length) {
        let desc = lines[i + 1];
        
        // Skip if next line is EA, a number, or another UPC
        if (/^(EA|\d+\.?\d*|\d{12,14})$/i.test(desc)) {
          // Try the line after that
          if (i + 2 < lines.length) {
            desc = lines[i + 2];
          } else {
            continue;
          }
        }
        
        desc = cleanDescription(desc);
        if (isValidDescription(desc)) {
          results.push({
            upc: cleanUPC(upc),
            name: desc,
            source: filename,
            format: 'central_pet'
          });
        }
      }
    }
  }
  
  return results;
}

// Generic parser
function parseGeneric(content: string, filename: string): UPCEntry[] {
  const results: UPCEntry[] = [];
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for UPC
    if (/^\d{12,14}$/.test(line)) {
      const upc = line;
      
      // Look for description in next few lines
      for (let j = 1; j <= 3 && i + j < lines.length; j++) {
        const nextLine = lines[i + j];
        if (/^[A-Z]/.test(nextLine) && isValidDescription(nextLine)) {
          results.push({
            upc: cleanUPC(upc),
            name: cleanDescription(nextLine),
            source: filename,
            format: 'generic'
          });
          break;
        }
      }
    }
    
    // Also check for inline UPCs
    const inlineMatch = line.match(/(\d{12,14})\s+([A-Z][A-Za-z0-9\s\-\/\.\'\#\&]+)/);
    if (inlineMatch) {
      const desc = cleanDescription(inlineMatch[2]);
      if (isValidDescription(desc)) {
        results.push({
          upc: cleanUPC(inlineMatch[1]),
          name: desc,
          source: filename,
          format: 'generic_inline'
        });
      }
    }
  }
  
  return results;
}

// Process all files
console.log('=== MULTI-FORMAT UPC EXTRACTION ===\n');

const extractedDir = 'attached_assets/extracted_new';
const textFiles = fs.readdirSync(extractedDir).filter(f => f.endsWith('.txt'));
console.log(`Processing ${textFiles.length} text files...\n`);

const formatCounts: Record<string, number> = {};
const formatUPCCounts: Record<string, number> = {};

for (const file of textFiles) {
  const content = fs.readFileSync(path.join(extractedDir, file), 'utf-8');
  const format = detectFormat(content);
  formatCounts[format] = (formatCounts[format] || 0) + 1;
  
  let results: UPCEntry[] = [];
  
  switch (format) {
    case 'central_pet':
      results = parseCentralPet(content, file);
      break;
    case 'order_format':
      results = parseOrderFormat(content, file);
      break;
    default:
      results = parseGeneric(content, file);
      break;
  }
  
  formatUPCCounts[format] = (formatUPCCounts[format] || 0) + results.length;
  allUPCs.push(...results);
}

console.log('Format distribution:');
for (const [format, count] of Object.entries(formatCounts)) {
  console.log(`  ${format}: ${count} files, ${formatUPCCounts[format] || 0} UPCs`);
}

console.log(`\nTotal UPCs from PDFs: ${allUPCs.length}`);

// Add Google Sheet data
console.log('\n=== ADDING GOOGLE SHEET DATA ===');
const csvPath = 'scripts/google_sheet_upcs.csv';
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const csvLines = csvContent.split('\n');
let googleCount = 0;

for (let i = 1; i < csvLines.length; i++) {
  const line = csvLines[i].trim();
  if (!line) continue;
  
  const match = line.match(/^(\d+),(.+?)(?:,|$)/);
  if (match) {
    const upc = match[1];
    const name = match[2].trim();
    if (isValidUPC(upc) && name.length > 2) {
      allUPCs.push({
        upc: cleanUPC(upc),
        name: name,
        source: 'google_sheet',
        format: 'google_sheet'
      });
      googleCount++;
    }
  }
}

console.log(`Google Sheet: ${googleCount} UPCs`);
console.log(`Total before dedup: ${allUPCs.length}`);

// Deduplicate by UPC - prefer Google Sheet names, then longest name
console.log('\n=== DEDUPLICATING ===');
const upcMap = new Map<string, UPCEntry>();

// Sort to prioritize: google_sheet first, then by name length
const sorted = allUPCs.sort((a, b) => {
  if (a.format === 'google_sheet' && b.format !== 'google_sheet') return -1;
  if (b.format === 'google_sheet' && a.format !== 'google_sheet') return 1;
  return b.name.length - a.name.length;
});

for (const entry of sorted) {
  if (!upcMap.has(entry.upc)) {
    upcMap.set(entry.upc, entry);
  }
}

const uniqueUPCs = Array.from(upcMap.values());
console.log(`Unique UPCs after dedup: ${uniqueUPCs.length}`);

// Save results
const outputPath = 'scripts/verified_upcs.json';
fs.writeFileSync(outputPath, JSON.stringify(uniqueUPCs, null, 2));
console.log(`\nSaved to ${outputPath}`);

// Show samples
console.log('\n=== SAMPLES ===');
const byFormat = new Map<string, UPCEntry[]>();
for (const entry of uniqueUPCs) {
  if (!byFormat.has(entry.format)) byFormat.set(entry.format, []);
  byFormat.get(entry.format)!.push(entry);
}

for (const [format, entries] of byFormat) {
  console.log(`\n${format} (${entries.length} unique UPCs):`);
  entries.slice(0, 5).forEach(e => console.log(`  ${e.upc}: ${e.name}`));
}

// Stats summary
console.log('\n=== SUMMARY ===');
console.log(`Total verified unique UPCs: ${uniqueUPCs.length}`);
const fromPDFs = uniqueUPCs.filter(u => u.format !== 'google_sheet').length;
const fromGoogle = uniqueUPCs.filter(u => u.format === 'google_sheet').length;
console.log(`  From PDFs: ${fromPDFs}`);
console.log(`  From Google Sheet: ${fromGoogle}`);
