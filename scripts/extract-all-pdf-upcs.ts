import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface ExtractedItem {
  upc: string;
  name: string;
  price?: string;
  quantity?: string;
}

interface PdfExtraction {
  filename: string;
  extractedAt: string;
  items: ExtractedItem[];
  error?: string;
}

interface ExtractionDatabase {
  lastUpdated: string;
  totalPdfs: number;
  processedPdfs: number;
  totalItems: number;
  extractions: PdfExtraction[];
}

const DB_PATH = 'scripts/pdf_extractions_db.json';

function loadDatabase(): ExtractionDatabase {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return {
      lastUpdated: new Date().toISOString(),
      totalPdfs: 0,
      processedPdfs: 0,
      totalItems: 0,
      extractions: []
    };
  }
}

function saveDatabase(db: ExtractionDatabase) {
  db.lastUpdated = new Date().toISOString();
  db.processedPdfs = db.extractions.length;
  db.totalItems = db.extractions.reduce((sum, e) => sum + e.items.length, 0);
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

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

async function pdfToImage(pdfPath: string): Promise<string | null> {
  try {
    const { pdf } = await import('pdf-to-img');
    const document = await pdf(pdfPath, { scale: 1.5 });
    for await (const image of document) {
      return Buffer.from(image).toString('base64');
    }
  } catch (err: any) {
    return null;
  }
  return null;
}

async function extractFromPdf(base64Image: string): Promise<ExtractedItem[]> {
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
              text: `Extract ALL product information from this invoice image. For each product, extract:
- UPC/barcode (10-14 digit number)
- Product name (full name as shown)
- Price (if visible)
- Quantity (if visible)

Return JSON array: [{"upc":"123456789012","name":"Product Name","price":"$9.99","quantity":"2"}]
Only include items with valid 10-14 digit UPCs. Return [] if none found.`
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64Image}` }
            }
          ]
        }
      ]
    });

    const content = response.choices[0]?.message?.content || '[]';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed
        .filter((item: any) => {
          const upc = String(item.upc || '').replace(/[^0-9]/g, '');
          return upc.length >= 10 && upc.length <= 14;
        })
        .map((item: any) => ({
          upc: String(item.upc || '').replace(/[^0-9]/g, ''),
          name: String(item.name || '').trim(),
          price: item.price || undefined,
          quantity: item.quantity || undefined
        }));
    }
  } catch (err: any) {
    console.log(`    API error: ${err.message?.slice(0, 50)}`);
  }
  return [];
}

async function main() {
  const batchSize = parseInt(process.argv[2]) || 30;
  
  console.log("=== PDF EXTRACTION DATABASE ===\n");
  
  const db = loadDatabase();
  const allPdfs = findAllPdfs('attached_assets');
  db.totalPdfs = allPdfs.length;
  
  console.log(`Total PDFs: ${allPdfs.length}`);
  
  const processedFiles = new Set(db.extractions.map(e => e.filename));
  const remaining = allPdfs.filter(p => !processedFiles.has(path.basename(p)));
  
  console.log(`Already processed: ${processedFiles.size}`);
  console.log(`Remaining: ${remaining.length}`);
  console.log(`Processing batch of: ${Math.min(batchSize, remaining.length)}\n`);

  const batch = remaining.slice(0, batchSize);
  
  for (let i = 0; i < batch.length; i++) {
    const pdfPath = batch[i];
    const filename = path.basename(pdfPath);
    console.log(`[${i + 1}/${batch.length}] ${filename}`);
    
    const base64 = await pdfToImage(pdfPath);
    if (!base64) {
      db.extractions.push({
        filename,
        extractedAt: new Date().toISOString(),
        items: [],
        error: 'Failed to convert PDF to image'
      });
      console.log(`  Error: Could not convert PDF`);
      continue;
    }
    
    const items = await extractFromPdf(base64);
    db.extractions.push({
      filename,
      extractedAt: new Date().toISOString(),
      items
    });
    
    console.log(`  Found ${items.length} items`);
    
    if ((i + 1) % 10 === 0) {
      saveDatabase(db);
      console.log(`  [Saved progress]`);
    }
  }
  
  saveDatabase(db);
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total PDFs: ${db.totalPdfs}`);
  console.log(`Processed: ${db.processedPdfs}`);
  console.log(`Total items extracted: ${db.totalItems}`);
  
  const uniqueUpcs = new Set<string>();
  for (const ext of db.extractions) {
    for (const item of ext.items) {
      uniqueUpcs.add(item.upc);
    }
  }
  console.log(`Unique UPCs: ${uniqueUpcs.size}`);
}

main().catch(console.error);
