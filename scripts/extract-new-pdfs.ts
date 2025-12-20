import fs from 'fs';
import OpenAI from 'openai';
import { pdf } from 'pdf-to-img';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface UPCEntry { upc: string; name: string; source: string; }

async function extractFromPDF(pdfPath: string): Promise<UPCEntry[]> {
  console.log(`\nProcessing: ${pdfPath}`);
  const document = await pdf(pdfPath, { scale: 2.0 });
  const upcs: UPCEntry[] = [];
  let pageNum = 0;
  
  for await (const image of document) {
    pageNum++;
    const base64Image = image.toString('base64');
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Extract ALL UPC/barcode numbers and product names from this invoice/catalog. Return ONLY JSON array: [{"upc": "...", "name": "..."}]. UPCs are 10-14 digits. Return [] if none.` },
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
        console.log(`  Page ${pageNum}: ${parsed.length} UPCs`);
      }
    } catch (e) {
      console.log(`  Page ${pageNum}: error`);
    }
  }
  
  console.log(`  Total: ${upcs.length} UPCs`);
  return upcs;
}

async function main() {
  const newPdfs = [
    'attached_assets/CamScanner_12-20-2025_14.20_1766262242013.pdf',
    'attached_assets/CamScanner_12-20-2025_14.24_1766262326375.pdf'
  ];
  
  // Load existing master list
  let master: UPCEntry[] = [];
  if (fs.existsSync('.local/state/memory/master_upc_database.json')) {
    master = JSON.parse(fs.readFileSync('.local/state/memory/master_upc_database.json', 'utf-8'));
    console.log(`Existing master list: ${master.length} UPCs`);
  }
  
  const existingUpcs = new Set(master.map(m => m.upc));
  let newCount = 0;
  
  for (const pdfPath of newPdfs) {
    if (fs.existsSync(pdfPath)) {
      const upcs = await extractFromPDF(pdfPath);
      for (const u of upcs) {
        if (!existingUpcs.has(u.upc) && u.upc.length >= 10 && /^\d+$/.test(u.upc)) {
          master.push(u);
          existingUpcs.add(u.upc);
          newCount++;
        }
      }
    }
  }
  
  console.log(`\nAdded ${newCount} new UPCs`);
  console.log(`Total master list: ${master.length} UPCs`);
  
  fs.writeFileSync('.local/state/memory/master_upc_database.json', JSON.stringify(master, null, 2));
  console.log('Updated master_upc_database.json');
}

main().catch(console.error);
