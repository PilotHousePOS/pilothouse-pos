import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

async function extractFromPdf(filePath: string): Promise<UpcEntry[]> {
  const entries: UpcEntry[] = [];
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const text = data.text;
    
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upcMatches = line.match(/\b(\d{10,14})\b/g);
      if (upcMatches) {
        for (const upc of upcMatches) {
          if (/^\d{8}$/.test(upc) || /^20\d{6}/.test(upc)) continue;
          
          const cleanUpc = upc.length > 12 ? upc.slice(-12) : upc;
          
          let name = line.replace(upc, '').trim();
          if (name.length < 5 && i > 0) {
            name = lines[i-1].trim() + ' ' + name;
          }
          name = name.replace(/^\d+\s*/, '');
          name = name.replace(/\$[\d,.]+/g, '');
          name = name.replace(/\d{1,3}\/\d{1,3}\/\d{2,4}/g, '');
          name = name.replace(/\s+/g, ' ').trim();
          
          if (name.length > 3 && cleanUpc.length >= 10) {
            entries.push({ upc: cleanUpc, name, source: path.basename(filePath) });
          }
        }
      }
    }
  } catch (err: any) {
    // Silent fail
  }
  return entries;
}

async function main() {
  const pdfDir = 'attached_assets';
  const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
  
  console.log(`Found ${files.length} PDF files to process`);
  
  const allEntries: UpcEntry[] = [];
  let processed = 0;
  
  for (const file of files) {
    const entries = await extractFromPdf(path.join(pdfDir, file));
    allEntries.push(...entries);
    processed++;
    if (processed % 20 === 0) {
      console.log(`Processed ${processed}/${files.length} PDFs, found ${allEntries.length} UPC entries so far`);
    }
  }
  
  console.log(`\nTotal entries extracted: ${allEntries.length}`);
  
  const upcMap = new Map<string, UpcEntry>();
  for (const entry of allEntries) {
    const existing = upcMap.get(entry.upc);
    if (!existing || entry.name.length > existing.name.length) {
      upcMap.set(entry.upc, entry);
    }
  }
  
  const unique = Array.from(upcMap.values());
  console.log(`Unique UPCs: ${unique.length}`);
  
  fs.writeFileSync('.local/state/memory/all_pdf_upcs.json', JSON.stringify(unique, null, 2));
  console.log('Saved to .local/state/memory/all_pdf_upcs.json');
}

main().catch(console.error);
