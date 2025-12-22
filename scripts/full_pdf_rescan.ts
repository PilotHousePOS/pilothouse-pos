import fs from 'fs';
import path from 'path';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default || pdfParseModule;

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
  line: string;
}

// Extract all UPC-like patterns from a line
function extractUPCsFromLine(line: string): string[] {
  const upcs: string[] = [];
  
  // Pattern 1: Standard 12-digit UPC
  const upc12 = line.match(/\b\d{12}\b/g);
  if (upc12) upcs.push(...upc12);
  
  // Pattern 2: 11-digit (missing leading 0)
  const upc11 = line.match(/\b\d{11}\b/g);
  if (upc11) upcs.push(...upc11.map(u => '0' + u));
  
  // Pattern 3: UPC with dashes or spaces (like 012-345-678901)
  const upcDash = line.match(/\b\d{3}[-\s]?\d{3}[-\s]?\d{6}\b/g);
  if (upcDash) upcs.push(...upcDash.map(u => u.replace(/[-\s]/g, '')));
  
  // Pattern 4: 13-digit EAN (take last 12)
  const ean13 = line.match(/\b\d{13}\b/g);
  if (ean13) upcs.push(...ean13.map(u => u.slice(-12)));
  
  return upcs.filter(u => {
    const num = u.replace(/^0+/, '');
    return num.length >= 10 && !/^0+$/.test(u);
  });
}

// Extract product name from the same line or context
function extractProductName(line: string, prevLine: string, upc: string): string {
  // Remove the UPC from line to get remaining text
  let name = line.replace(upc, '').trim();
  
  // Clean up common patterns
  name = name
    .replace(/^\s*[-|,]\s*/, '')
    .replace(/\s*[-|,]\s*$/, '')
    .replace(/\$[\d,.]+/g, '') // Remove prices
    .replace(/\d+\s*(ea|pk|ct|oz|lb|gal|qt|ml|g|kg)\b/gi, '') // Remove quantities
    .replace(/^\d+\s*/, '') // Remove leading numbers
    .trim();
  
  // If name is too short, try previous line
  if (name.length < 3 && prevLine) {
    name = prevLine.replace(/\$[\d,.]+/g, '').trim();
  }
  
  return name || 'Unknown Product';
}

async function extractFromPDF(pdfPath: string): Promise<UPCEntry[]> {
  const entries: UPCEntry[] = [];
  const fileName = path.basename(pdfPath);
  
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    
    const lines = data.text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : '';
      
      const upcs = extractUPCsFromLine(line);
      
      for (const upc of upcs) {
        const cleanUPC = upc.padStart(12, '0');
        const name = extractProductName(line, prevLine, upc);
        
        entries.push({
          upc: cleanUPC,
          name,
          source: fileName,
          line: line.substring(0, 200)
        });
      }
    }
  } catch (err) {
    console.error(`Error processing ${fileName}: ${err}`);
  }
  
  return entries;
}

async function main() {
  console.log('=== FULL PDF RESCAN - LINE BY LINE ===\n');
  
  // Find all PDFs
  const pdfDir = 'attached_assets';
  const allFiles = fs.readdirSync(pdfDir);
  const pdfFiles = allFiles.filter(f => f.toLowerCase().endsWith('.pdf'));
  
  console.log(`Found ${pdfFiles.length} PDF files to process\n`);
  
  const allEntries: UPCEntry[] = [];
  const upcSet = new Set<string>();
  let processedCount = 0;
  
  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(pdfDir, pdfFile);
    const entries = await extractFromPDF(pdfPath);
    
    for (const entry of entries) {
      if (!upcSet.has(entry.upc)) {
        upcSet.add(entry.upc);
        allEntries.push(entry);
      }
    }
    
    processedCount++;
    if (processedCount % 50 === 0) {
      console.log(`Processed ${processedCount}/${pdfFiles.length} PDFs, found ${upcSet.size} unique UPCs`);
    }
  }
  
  console.log(`\nProcessed all ${processedCount} PDFs`);
  console.log(`Total unique UPCs extracted: ${upcSet.size}`);
  
  // Save results
  fs.writeFileSync('scripts/pdf_extracted_upcs.json', JSON.stringify(allEntries, null, 2));
  console.log(`\nSaved to scripts/pdf_extracted_upcs.json`);
  
  // Show sample
  console.log('\nSample extractions:');
  allEntries.slice(0, 15).forEach(e => {
    console.log(`  ${e.upc}: ${e.name.substring(0, 50)} [${e.source}]`);
  });
}

main().catch(console.error);
