import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, or, isNull, sql } from 'drizzle-orm';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const ExcelJS = require('exceljs');

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

// Find all PDFs recursively
function findAllPdfs(dir: string): string[] {
  const pdfs: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pdfs.push(...findAllPdfs(fullPath));
    } else if (entry.name.toLowerCase().endsWith('.pdf')) {
      pdfs.push(fullPath);
    }
  }
  return pdfs;
}

// Extract UPCs from PDF
async function extractFromPdf(filePath: string): Promise<UpcEntry[]> {
  const entries: UpcEntry[] = [];
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const text = data.text;
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for UPC patterns (10-14 digits)
      const upcMatches = line.match(/\b(\d{10,14})\b/g);
      if (upcMatches) {
        for (const upc of upcMatches) {
          // Skip date-like patterns
          if (/^\d{8}$/.test(upc) || /^20\d{6}/.test(upc)) continue;
          
          const cleanUpc = upc.length > 12 ? upc.slice(-12) : upc;
          
          // Extract product name from the line
          let name = line.replace(upc, '').trim();
          if (name.length < 5 && i > 0) {
            name = lines[i-1].trim() + ' ' + name;
          }
          // Clean up name
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
    // Silent fail for unreadable PDFs
  }
  return entries;
}

// Extract from Excel files
async function extractFromExcel(filePath: string): Promise<UpcEntry[]> {
  const entries: UpcEntry[] = [];
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    workbook.eachSheet((worksheet: any) => {
      const headers: string[] = [];
      let upcCol = -1;
      let nameCol = -1;
      let descCol = -1;
      
      worksheet.eachRow((row: any, rowNum: number) => {
        const values = row.values as any[];
        
        // Find header row
        if (rowNum === 1) {
          for (let i = 0; i < values.length; i++) {
            const val = String(values[i] || '').toLowerCase();
            headers.push(val);
            if (val.includes('upc') || val.includes('sku') || val.includes('barcode')) {
              upcCol = i;
            }
            if (val.includes('name') || val.includes('item') || val.includes('product')) {
              nameCol = i;
            }
            if (val.includes('desc')) {
              descCol = i;
            }
          }
          return;
        }
        
        // Extract data rows
        if (upcCol >= 0 && nameCol >= 0) {
          const upc = String(values[upcCol] || '').replace(/[^0-9]/g, '');
          const name = String(values[nameCol] || '').trim();
          const desc = descCol >= 0 ? String(values[descCol] || '').trim() : '';
          
          if (upc.length >= 10 && name.length > 3) {
            entries.push({
              upc: upc.length > 12 ? upc.slice(-12) : upc,
              name: desc && desc.length > name.length ? desc : name,
              source: path.basename(filePath)
            });
          }
        }
      });
    });
  } catch (err: any) {
    console.log(`Error processing ${filePath}: ${err.message}`);
  }
  return entries;
}

// Aggressive text normalization for matching
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createMatchKey(text: string): string {
  const normalized = normalizeForMatch(text);
  const tokens = normalized.split(' ').filter(t => t.length > 0);
  return tokens.sort().join('|');
}

async function main() {
  console.log('=== FULL SOURCE MATERIAL SCAN ===\n');
  
  // Step 1: Find all PDFs
  console.log('Step 1: Finding all PDF files...');
  const pdfFiles = findAllPdfs('attached_assets');
  console.log(`Found ${pdfFiles.length} PDF files\n`);
  
  // Step 2: Find all Excel files
  const excelFiles = fs.readdirSync('attached_assets')
    .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
    .map(f => path.join('attached_assets', f));
  console.log(`Found ${excelFiles.length} Excel files\n`);
  
  // Step 3: Extract from all PDFs
  console.log('Step 2: Extracting UPCs from PDFs...');
  const pdfEntries: UpcEntry[] = [];
  let processed = 0;
  
  for (const pdfFile of pdfFiles) {
    const entries = await extractFromPdf(pdfFile);
    pdfEntries.push(...entries);
    processed++;
    if (processed % 50 === 0) {
      console.log(`  Processed ${processed}/${pdfFiles.length} PDFs, ${pdfEntries.length} entries`);
    }
  }
  console.log(`  Total PDF entries: ${pdfEntries.length}\n`);
  
  // Step 4: Extract from all Excel files
  console.log('Step 3: Extracting UPCs from Excel files...');
  const excelEntries: UpcEntry[] = [];
  for (const excelFile of excelFiles) {
    console.log(`  Processing: ${path.basename(excelFile)}`);
    const entries = await extractFromExcel(excelFile);
    excelEntries.push(...entries);
    console.log(`    Found ${entries.length} entries`);
  }
  console.log(`  Total Excel entries: ${excelEntries.length}\n`);
  
  // Step 5: Load existing maybe_upcs.json
  console.log('Step 4: Loading existing UPC sources...');
  const maybeUpcs: UpcEntry[] = JSON.parse(fs.readFileSync('maybe_upcs.json', 'utf-8'));
  console.log(`  maybe_upcs.json: ${maybeUpcs.length} entries`);
  
  let googleUpcs: UpcEntry[] = [];
  try {
    const csvContent = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
    const lines = csvContent.split('\n').slice(1);
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const upc = parts[0].replace(/[^0-9]/g, '');
        const name = parts.slice(1).join(',').replace(/"/g, '').trim();
        if (upc.length >= 10 && name.length > 3) {
          googleUpcs.push({ upc, name, source: 'google_sheet' });
        }
      }
    }
  } catch (e) {}
  console.log(`  Google Sheet: ${googleUpcs.length} entries`);
  
  // Step 6: Combine all sources
  console.log('\nStep 5: Combining all sources...');
  const allEntries = [...maybeUpcs, ...pdfEntries, ...excelEntries, ...googleUpcs];
  console.log(`  Total entries: ${allEntries.length}`);
  
  // Dedupe by UPC, keeping longest name
  const upcMap = new Map<string, UpcEntry>();
  for (const entry of allEntries) {
    const existing = upcMap.get(entry.upc);
    if (!existing || entry.name.length > existing.name.length) {
      upcMap.set(entry.upc, entry);
    }
  }
  const uniqueEntries = Array.from(upcMap.values());
  console.log(`  Unique UPCs: ${uniqueEntries.length}`);
  
  // Save combined sources
  fs.writeFileSync('scripts/all_combined_upcs.json', JSON.stringify(uniqueEntries, null, 2));
  console.log('  Saved to scripts/all_combined_upcs.json');
  
  // Step 7: Match against database
  console.log('\nStep 6: Matching against database products...');
  
  const missingProducts = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  console.log(`  Products missing UPC: ${missingProducts.length}`);
  
  // Build match key map
  const keyToUPC = new Map<string, { upc: string; name: string }>();
  for (const entry of uniqueEntries) {
    const key = createMatchKey(entry.name);
    if (!keyToUPC.has(key)) {
      keyToUPC.set(key, { upc: entry.upc, name: entry.name });
    }
  }
  console.log(`  Match keys created: ${keyToUPC.size}`);
  
  let matched = 0;
  const matches: string[] = [];
  
  for (const product of missingProducts) {
    const productKey = createMatchKey(product.name);
    const upcEntry = keyToUPC.get(productKey);
    
    if (upcEntry) {
      await db.update(supplies)
        .set({ sku: upcEntry.upc })
        .where(eq(supplies.id, product.id));
      matched++;
      matches.push(`MATCH: "${product.name}" -> "${upcEntry.name}" = ${upcEntry.upc}`);
    }
  }
  
  console.log(`\n=== RESULTS ===`);
  console.log(`New matches: ${matched}`);
  
  // Show sample matches
  if (matches.length > 0) {
    console.log('\nSample matches:');
    matches.slice(0, 30).forEach(m => console.log(m));
  }
  
  // Final coverage
  const result = await db.execute(sql`
    SELECT COUNT(*) as total,
           COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
    FROM supplies
  `);
  const row = result.rows[0] as { total: string; with_upc: string };
  console.log(`\nFinal coverage: ${row.with_upc}/${row.total} (${(100 * parseInt(row.with_upc) / parseInt(row.total)).toFixed(1)}%)`);
  
  process.exit(0);
}

main().catch(console.error);
