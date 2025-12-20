import fs from 'fs';
import OpenAI from 'openai';
import { pdf } from 'pdf-to-img';
import ExcelJS from 'exceljs';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

async function extractFromPDF(pdfPath: string): Promise<UPCEntry[]> {
  console.log(`\nProcessing PDF: ${pdfPath}`);
  const document = await pdf(pdfPath, { scale: 2.0 });
  const upcs: UPCEntry[] = [];
  let pageNum = 0;
  
  for await (const image of document) {
    pageNum++;
    console.log(`  Page ${pageNum}...`);
    
    const base64Image = image.toString('base64');
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Extract all UPC/barcode numbers and product names from this document. Return ONLY a JSON array: [{"upc": "...", "name": "..."}]. UPC codes are 10-14 digit numbers. If none found, return [].` },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
          ]
        }],
        max_tokens: 4000
      });
      
      const content = response.choices[0]?.message?.content || '[]';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const item of parsed) {
          if (item.upc && item.name) {
            upcs.push({ upc: String(item.upc).trim(), name: String(item.name).trim(), source: pdfPath });
          }
        }
      }
    } catch (e) {
      console.log(`  Error on page ${pageNum}:`, e);
    }
  }
  
  console.log(`  Extracted ${upcs.length} UPCs from ${pdfPath}`);
  return upcs;
}

async function extractFromExcel(excelPath: string): Promise<UPCEntry[]> {
  console.log(`\nProcessing Excel: ${excelPath}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  const upcs: UPCEntry[] = [];
  const seenUpcs = new Set<string>();
  
  workbook.eachSheet((sheet) => {
    console.log(`  Sheet: ${sheet.name}, rows: ${sheet.rowCount}`);
    
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // Skip header
      
      const values = row.values as any[];
      if (!values || values.length < 2) return;
      
      // Look for UPC-like values (10-14 digit numbers)
      for (let i = 1; i < Math.min(values.length, 10); i++) {
        const val = String(values[i] || '').trim();
        // Check if it looks like a UPC (10-14 digits, possibly with leading zeros)
        if (/^\d{10,14}$/.test(val) || /^0\d{9,13}$/.test(val)) {
          const upc = val.replace(/^0+/, '').padStart(10, '0'); // Normalize
          if (!seenUpcs.has(upc) && upc.length >= 10) {
            // Get product name from nearby columns
            let name = '';
            for (let j = 1; j < values.length && j < 10; j++) {
              if (j !== i && values[j] && typeof values[j] === 'string' && values[j].length > 3) {
                name = String(values[j]).trim();
                break;
              }
            }
            if (name) {
              seenUpcs.add(val);
              upcs.push({ upc: val, name, source: excelPath });
            }
          }
        }
      }
    });
  });
  
  console.log(`  Extracted ${upcs.length} UPCs from Excel`);
  return upcs;
}

async function loadExistingUPCs(): Promise<UPCEntry[]> {
  const upcs: UPCEntry[] = [];
  
  // Load complete database
  if (fs.existsSync('.local/state/memory/complete_upc_database.json')) {
    const data = JSON.parse(fs.readFileSync('.local/state/memory/complete_upc_database.json', 'utf-8'));
    for (const entry of data) {
      upcs.push({ upc: entry.upc, name: entry.name, source: entry.source || 'existing' });
    }
    console.log(`Loaded ${upcs.length} from existing database`);
  }
  
  // Load Google Sheet
  if (fs.existsSync('scripts/google_sheet_upcs.csv')) {
    const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
    for (const line of csv.split('\n').slice(1)) {
      const parts = line.split(',');
      if (parts.length >= 2 && parts[0].trim().length >= 10) {
        upcs.push({ upc: parts[0].trim(), name: parts[1].trim(), source: 'google_sheet' });
      }
    }
    console.log(`Added Google Sheet entries`);
  }
  
  // Load invoice UPCs
  if (fs.existsSync('.local/state/memory/all_invoice_upcs.txt')) {
    const txt = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
    for (const line of txt.split('\n').slice(1)) {
      const parts = line.split('|');
      if (parts.length >= 3 && parts[0].trim().length >= 10) {
        upcs.push({ upc: parts[0].trim(), name: parts[2].trim(), source: 'invoice' });
      }
    }
    console.log(`Added invoice entries`);
  }
  
  return upcs;
}

async function main() {
  const allUpcs: UPCEntry[] = [];
  
  // 1. Load existing UPCs
  const existing = await loadExistingUPCs();
  allUpcs.push(...existing);
  
  // 2. Extract from PDFs
  const pdfs = [
    'attached_assets/CamScanner_12-20-2025_14.10_1766261631905.pdf',
    'attached_assets/CamScanner_12-20-2025_14.14_1766261933218.pdf'
  ];
  
  for (const pdfPath of pdfs) {
    if (fs.existsSync(pdfPath)) {
      const pdfUpcs = await extractFromPDF(pdfPath);
      allUpcs.push(...pdfUpcs);
    }
  }
  
  // 3. Extract from Excel
  const excelPath = 'attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx';
  if (fs.existsSync(excelPath)) {
    const excelUpcs = await extractFromExcel(excelPath);
    allUpcs.push(...excelUpcs);
  }
  
  // 4. Deduplicate by UPC, keeping best name
  console.log(`\nTotal entries before dedup: ${allUpcs.length}`);
  const upcMap = new Map<string, UPCEntry>();
  
  for (const entry of allUpcs) {
    const upc = entry.upc.trim();
    if (upc.length < 10 || !/^\d+$/.test(upc)) continue;
    
    const existing = upcMap.get(upc);
    if (!existing || entry.name.length > existing.name.length) {
      upcMap.set(upc, entry);
    }
  }
  
  const uniqueUpcs = Array.from(upcMap.values());
  console.log(`Unique UPCs after dedup: ${uniqueUpcs.length}`);
  
  // Save master list
  fs.writeFileSync('.local/state/memory/master_upc_database.json', JSON.stringify(uniqueUpcs, null, 2));
  console.log('Saved to .local/state/memory/master_upc_database.json');
  
  // Stats by source
  const bySource: Record<string, number> = {};
  for (const u of uniqueUpcs) {
    bySource[u.source] = (bySource[u.source] || 0) + 1;
  }
  console.log('\nUPCs by source:');
  for (const [src, count] of Object.entries(bySource)) {
    console.log(`  ${src}: ${count}`);
  }
}

main().catch(console.error);
