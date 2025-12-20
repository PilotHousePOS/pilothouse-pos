import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { pdf } from 'pdf-to-img';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface ExtractedItem {
  upc: string;
  name: string;
  source: string;
}

async function extractFromPdfWithVision(pdfPath: string): Promise<ExtractedItem[]> {
  const items: ExtractedItem[] = [];
  const fileName = path.basename(pdfPath);
  
  try {
    const document = await pdf(pdfPath, { scale: 2 });
    let pageNum = 0;
    
    for await (const image of document) {
      pageNum++;
      const base64 = image.toString('base64');
      
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `This is a scanned invoice from a pet store supplier. Extract ALL UPC codes and their corresponding product names/descriptions.

Return ONLY a JSON array with objects containing "upc" (10-14 digit number) and "name" (product description).
Example: [{"upc": "012345678901", "name": "Science Diet Adult Dog Food 15lb"}]

Rules:
- UPCs are 10-14 digit numbers, often in a column labeled UPC, SKU, or Item #
- Product names may be abbreviated (e.g., "SD Pup Sm Br Ck 4.5#" = Science Diet Puppy Small Breed Chicken 4.5lb)
- Include ALL items you can read, even if partially visible
- If you can't find any UPCs, return an empty array []
- Return ONLY valid JSON, no markdown or explanation`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64}`,
                  detail: 'high'
                }
              }
            ]
          }]
        });
        
        const content = response.choices[0]?.message?.content || '[]';
        // Extract JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            for (const item of parsed) {
              if (item.upc && item.name) {
                const cleanUpc = String(item.upc).replace(/\D/g, '');
                if (cleanUpc.length >= 10 && cleanUpc.length <= 14) {
                  items.push({
                    upc: cleanUpc,
                    name: item.name,
                    source: `${fileName}:page${pageNum}`
                  });
                }
              }
            }
          } catch (e) {
            // JSON parse error - skip
          }
        }
      } catch (err: any) {
        console.error(`  Vision API error on page ${pageNum}:`, err.message?.substring(0, 50));
      }
    }
  } catch (err: any) {
    console.error(`  Error processing ${fileName}:`, err.message?.substring(0, 50));
  }
  
  return items;
}

async function main() {
  const pdfDir = 'attached_assets';
  const allPdfs = fs.readdirSync(pdfDir)
    .filter(f => f.endsWith('.pdf'))
    .map(f => path.join(pdfDir, f));
  
  console.log(`Found ${allPdfs.length} PDF files`);
  
  // Filter to CamScanner files (the scanned invoices)
  const scannerPdfs = allPdfs.filter(f => 
    f.includes('CamScanner') || 
    !f.includes('order_') // non-order PDFs are likely scanned invoices
  );
  
  console.log(`Processing ${scannerPdfs.length} likely invoice PDFs`);
  
  const allItems: ExtractedItem[] = [];
  let processed = 0;
  
  // Process in batches to avoid rate limits
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < scannerPdfs.length; i += BATCH_SIZE) {
    const batch = scannerPdfs.slice(i, i + BATCH_SIZE);
    
    for (const pdfPath of batch) {
      console.log(`[${++processed}/${scannerPdfs.length}] ${path.basename(pdfPath)}`);
      const items = await extractFromPdfWithVision(pdfPath);
      console.log(`  Extracted ${items.length} items`);
      allItems.push(...items);
    }
    
    // Save progress after each batch
    if (allItems.length > 0) {
      fs.writeFileSync('.local/state/memory/ocr_extracted_upcs.json', JSON.stringify(allItems, null, 2));
    }
    
    console.log(`Progress: ${processed}/${scannerPdfs.length}, Total items: ${allItems.length}`);
  }
  
  // Deduplicate
  const upcMap = new Map<string, ExtractedItem>();
  for (const item of allItems) {
    const existing = upcMap.get(item.upc);
    if (!existing || item.name.length > existing.name.length) {
      upcMap.set(item.upc, item);
    }
  }
  
  const unique = Array.from(upcMap.values());
  console.log(`\nTotal extracted: ${allItems.length}`);
  console.log(`Unique UPCs: ${unique.length}`);
  
  fs.writeFileSync('.local/state/memory/ocr_unique_upcs.json', JSON.stringify(unique, null, 2));
  console.log('Saved to .local/state/memory/ocr_unique_upcs.json');
}

main().catch(console.error);
