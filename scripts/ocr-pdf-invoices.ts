import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, or, isNull, sql } from 'drizzle-orm';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface UpcEntry {
  upc: string;
  name: string;
  source: string;
}

// Find all PDFs recursively
function findAllPdfs(dir: string): string[] {
  const pdfs: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pdfs.push(...findAllPdfs(fullPath));
      } else if (entry.name.toLowerCase().endsWith('.pdf')) {
        pdfs.push(fullPath);
      }
    }
  } catch (e) {}
  return pdfs;
}

// Convert PDF to base64 images using pdf-to-img
async function pdfToImages(pdfPath: string): Promise<string[]> {
  const images: string[] = [];
  try {
    const { pdf } = await import('pdf-to-img');
    const document = await pdf(pdfPath, { scale: 2 });
    
    let pageNum = 0;
    for await (const image of document) {
      const base64 = Buffer.from(image).toString('base64');
      images.push(base64);
      pageNum++;
      if (pageNum >= 5) break; // Limit to first 5 pages per PDF
    }
  } catch (err: any) {
    console.log(`  Error converting ${path.basename(pdfPath)}: ${err.message}`);
  }
  return images;
}

// Extract UPCs using GPT-4 Vision
async function extractUpcsFromImage(base64Image: string, source: string): Promise<UpcEntry[]> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_completion_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `This is a pet store invoice/order document. Extract ALL product UPC codes and their product names.

Return ONLY a JSON array with this format:
[{"upc": "123456789012", "name": "Product Name"}]

Rules:
- UPCs are 10-14 digit numbers (barcodes)
- Include the full product name/description
- Skip prices, dates, quantities
- If no UPCs found, return []`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ]
    });

    const content = response.choices[0]?.message?.content || '[]';
    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((item: any) => ({
        upc: String(item.upc || '').replace(/[^0-9]/g, ''),
        name: String(item.name || '').trim(),
        source
      })).filter((e: UpcEntry) => e.upc.length >= 10 && e.name.length > 3);
    }
  } catch (err: any) {
    if (err.message?.includes('rate')) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return [];
}

// Normalize text for matching
function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function createMatchKey(text: string): string {
  const tokens = normalizeForMatch(text).split(' ').filter(t => t.length > 0);
  return tokens.sort().join('|');
}

async function main() {
  console.log('=== PDF INVOICE OCR EXTRACTION ===\n');
  
  // Find all PDFs
  const pdfFiles = findAllPdfs('attached_assets');
  console.log(`Found ${pdfFiles.length} PDF files\n`);
  
  const allEntries: UpcEntry[] = [];
  let processed = 0;
  let errors = 0;
  
  // Process PDFs in batches
  for (const pdfFile of pdfFiles) {
    processed++;
    const basename = path.basename(pdfFile);
    console.log(`[${processed}/${pdfFiles.length}] Processing: ${basename}`);
    
    try {
      const images = await pdfToImages(pdfFile);
      console.log(`  Pages: ${images.length}`);
      
      for (let i = 0; i < images.length; i++) {
        const entries = await extractUpcsFromImage(images[i], basename);
        if (entries.length > 0) {
          console.log(`  Page ${i+1}: Found ${entries.length} UPCs`);
          allEntries.push(...entries);
        }
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err: any) {
      errors++;
      console.log(`  Error: ${err.message}`);
    }
    
    // Progress save every 50 PDFs
    if (processed % 50 === 0) {
      fs.writeFileSync('scripts/pdf_ocr_progress.json', JSON.stringify(allEntries, null, 2));
      console.log(`\n  Progress saved: ${allEntries.length} entries from ${processed} PDFs\n`);
    }
  }
  
  console.log(`\n=== EXTRACTION COMPLETE ===`);
  console.log(`Total entries extracted: ${allEntries.length}`);
  console.log(`Errors: ${errors}`);
  
  // Dedupe by UPC
  const upcMap = new Map<string, UpcEntry>();
  for (const entry of allEntries) {
    const existing = upcMap.get(entry.upc);
    if (!existing || entry.name.length > existing.name.length) {
      upcMap.set(entry.upc, entry);
    }
  }
  const uniqueEntries = Array.from(upcMap.values());
  console.log(`Unique UPCs: ${uniqueEntries.length}`);
  
  // Save extracted UPCs
  fs.writeFileSync('scripts/pdf_ocr_upcs.json', JSON.stringify(uniqueEntries, null, 2));
  console.log('Saved to scripts/pdf_ocr_upcs.json');
  
  // Match against database
  console.log('\n=== MATCHING AGAINST DATABASE ===');
  
  const missingProducts = await db.select()
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  console.log(`Products missing UPC: ${missingProducts.length}`);
  
  // Build match key map
  const keyToUPC = new Map<string, { upc: string; name: string }>();
  for (const entry of uniqueEntries) {
    const key = createMatchKey(entry.name);
    if (!keyToUPC.has(key)) {
      keyToUPC.set(key, { upc: entry.upc, name: entry.name });
    }
  }
  
  let matched = 0;
  for (const product of missingProducts) {
    const productKey = createMatchKey(product.name);
    const upcEntry = keyToUPC.get(productKey);
    
    if (upcEntry) {
      await db.update(supplies)
        .set({ sku: upcEntry.upc })
        .where(eq(supplies.id, product.id));
      matched++;
    }
  }
  
  console.log(`New matches: ${matched}`);
  
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
