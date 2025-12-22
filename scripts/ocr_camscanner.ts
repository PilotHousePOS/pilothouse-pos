import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface UPCEntry {
  upc: string;
  name: string;
  source: string;
}

async function extractUPCsFromImage(imagePath: string): Promise<UPCEntry[]> {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/png';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `This is a scanned invoice or product list. Please extract all UPC codes (10-14 digit numbers) along with their associated product names/descriptions.

Return the data in this exact JSON format:
[
  {"upc": "123456789012", "name": "Product Name Here"},
  ...
]

Only return valid JSON array. If no UPCs are found, return [].
Look for UPC codes which are typically 12-14 digit numbers, often near product descriptions.`
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          }
        ]
      }
    ]
  });

  const content = response.choices[0].message.content || '[]';
  
  // Extract JSON from response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((item: any) => ({
      upc: String(item.upc).replace(/[^0-9]/g, '').padStart(12, '0'),
      name: String(item.name || '').trim(),
      source: imagePath
    })).filter((item: UPCEntry) => item.upc.length >= 10 && item.name.length > 2);
  } catch (e) {
    console.log('  Parse error:', e);
    return [];
  }
}

async function main() {
  const imageDir = 'attached_assets/camscanner_images';
  const images = fs.readdirSync(imageDir).filter(f => f.endsWith('.png')).sort();
  
  console.log(`Processing ${images.length} images with OCR...\n`);
  
  const allUPCs: UPCEntry[] = [];
  
  // Process in batches of 5 for rate limiting
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    console.log(`[${i + 1}/${images.length}] ${img}`);
    
    try {
      const upcs = await extractUPCsFromImage(path.join(imageDir, img));
      console.log(`  Found ${upcs.length} UPCs`);
      upcs.forEach(u => console.log(`    ${u.upc}: ${u.name}`));
      allUPCs.push(...upcs);
    } catch (e: any) {
      console.log(`  Error: ${e.message}`);
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total UPCs extracted: ${allUPCs.length}`);
  
  // Deduplicate
  const uniqueMap = new Map<string, UPCEntry>();
  for (const entry of allUPCs) {
    if (!uniqueMap.has(entry.upc)) {
      uniqueMap.set(entry.upc, entry);
    }
  }
  
  const uniqueUPCs = Array.from(uniqueMap.values());
  console.log(`Unique UPCs: ${uniqueUPCs.length}`);
  
  // Save results
  const outputPath = 'scripts/camscanner_upcs.json';
  fs.writeFileSync(outputPath, JSON.stringify(uniqueUPCs, null, 2));
  console.log(`Saved to ${outputPath}`);
}

main();
