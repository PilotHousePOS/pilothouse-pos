import fs from 'fs';
import OpenAI from 'openai';
import { pdf } from 'pdf-to-img';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function main() {
  console.log('Converting PDF to images...');
  
  const pdfPath = 'attached_assets/CamScanner_12-20-2025_14.10_1766261631905.pdf';
  const document = await pdf(pdfPath, { scale: 2.0 });
  
  const allUpcs: {upc: string, name: string}[] = [];
  let pageNum = 0;
  
  for await (const image of document) {
    pageNum++;
    console.log(`Processing page ${pageNum}...`);
    
    const base64Image = image.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract all UPC codes and product names from this invoice/inventory document. 
Return ONLY a JSON array of objects with "upc" and "name" fields.
UPC codes are typically 10-14 digit numbers.
Example format: [{"upc": "012345678901", "name": "Product Name"}]
If no UPCs are found, return an empty array: []`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 4000
    });
    
    const content = response.choices[0]?.message?.content || '[]';
    console.log(`Page ${pageNum} response preview:`, content.substring(0, 300));
    
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const upcs = JSON.parse(jsonMatch[0]);
        allUpcs.push(...upcs);
        console.log(`Found ${upcs.length} UPCs on page ${pageNum}`);
      }
    } catch (e) {
      console.log(`Failed to parse page ${pageNum}`);
    }
  }
  
  console.log(`\nTotal UPCs extracted: ${allUpcs.length}`);
  
  if (allUpcs.length > 0) {
    fs.writeFileSync('.local/state/memory/new_pdf_upcs.json', JSON.stringify(allUpcs, null, 2));
    console.log('Saved to .local/state/memory/new_pdf_upcs.json');
  }
}

main().catch(console.error);
