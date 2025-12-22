import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

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

// Load already processed files
function loadProcessed(): Set<string> {
  try {
    const data = JSON.parse(fs.readFileSync('scripts/processed_pdfs.json', 'utf-8'));
    return new Set(data);
  } catch {
    return new Set();
  }
}

// Save processed files
function saveProcessed(processed: Set<string>) {
  fs.writeFileSync('scripts/processed_pdfs.json', JSON.stringify([...processed], null, 2));
}

// Load all extracted entries
function loadExtracted(): UpcEntry[] {
  try {
    return JSON.parse(fs.readFileSync('scripts/pdf_ocr_upcs.json', 'utf-8'));
  } catch {
    return [];
  }
}

// Save extracted entries
function saveExtracted(entries: UpcEntry[]) {
  fs.writeFileSync('scripts/pdf_ocr_upcs.json', JSON.stringify(entries, null, 2));
}

// Convert PDF to base64 image (first page only for speed)
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

// Extract UPCs using GPT-4o-mini (faster/cheaper)
async function extractUpcs(base64Image: string, source: string): Promise<UpcEntry[]> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_completion_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract product UPCs (10-14 digit barcodes) and names from this invoice. Return JSON: [{"upc":"123456789012","name":"Product Name"}]. Only valid UPCs. Return [] if none.`
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
      return parsed.map((item: any) => ({
        upc: String(item.upc || '').replace(/[^0-9]/g, ''),
        name: String(item.name || '').trim(),
        source
      })).filter((e: UpcEntry) => e.upc.length >= 10 && e.name.length > 2);
    }
  } catch (err: any) {
    console.log(`  API error: ${err.message?.slice(0, 50)}`);
  }
  return [];
}

async function main() {
  const batchSize = parseInt(process.argv[2] || '50');
  
  console.log('=== BATCH PDF OCR ===\n');
  
  const allPdfs = findAllPdfs('attached_assets');
  const processed = loadProcessed();
  const allEntries = loadExtracted();
  
  console.log(`Total PDFs: ${allPdfs.length}`);
  console.log(`Already processed: ${processed.size}`);
  console.log(`Existing UPCs: ${allEntries.length}`);
  
  const remaining = allPdfs.filter(p => !processed.has(path.basename(p)));
  const batch = remaining.slice(0, batchSize);
  
  console.log(`Processing batch of: ${batch.length} PDFs\n`);
  
  let newEntries = 0;
  
  for (let i = 0; i < batch.length; i++) {
    const pdfFile = batch[i];
    const basename = path.basename(pdfFile);
    console.log(`[${i+1}/${batch.length}] ${basename}`);
    
    const image = await pdfToImage(pdfFile);
    if (image) {
      const entries = await extractUpcs(image, basename);
      if (entries.length > 0) {
        console.log(`  Found ${entries.length} UPCs`);
        allEntries.push(...entries);
        newEntries += entries.length;
      }
    } else {
      console.log(`  Failed to convert`);
    }
    
    processed.add(basename);
    
    // Save every 10 PDFs
    if ((i + 1) % 10 === 0) {
      saveProcessed(processed);
      saveExtracted(allEntries);
      console.log(`  Saved progress\n`);
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  // Final save
  saveProcessed(processed);
  saveExtracted(allEntries);
  
  // Dedupe
  const upcMap = new Map<string, UpcEntry>();
  for (const e of allEntries) {
    const existing = upcMap.get(e.upc);
    if (!existing || e.name.length > existing.name.length) {
      upcMap.set(e.upc, e);
    }
  }
  
  console.log(`\n=== RESULTS ===`);
  console.log(`New entries this batch: ${newEntries}`);
  console.log(`Total entries: ${allEntries.length}`);
  console.log(`Unique UPCs: ${upcMap.size}`);
  console.log(`Remaining PDFs: ${remaining.length - batch.length}`);
}

main().catch(console.error);
