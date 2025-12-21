const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function main() {
  const pdfDir = './attached_assets';
  const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
  
  console.log(`Found ${pdfFiles.length} PDFs to extract`);
  
  const outputDir = './attached_assets/extracted_new';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let extracted = 0;
  let failed = 0;
  const allItems = [];
  const seenUpcs = new Set();
  
  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    const pdfPath = path.join(pdfDir, file);
    const txtPath = path.join(outputDir, file.replace('.pdf', '.txt'));
    
    try {
      const buf = fs.readFileSync(pdfPath);
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      
      fs.writeFileSync(txtPath, result.text);
      extracted++;
      
      // Extract UPCs from text
      const lines = result.text.split('\n');
      for (const line of lines) {
        const upcMatch = line.match(/\b(\d{12,14})\b/g);
        if (!upcMatch) continue;
        
        for (const upc of upcMatch) {
          if (upc.startsWith('0000') || seenUpcs.has(upc)) continue;
          
          // Look for name nearby in the line
          const idx = line.indexOf(upc);
          const rest = line.substring(idx + upc.length);
          const parts = rest.split(/\s{2,}/);
          
          let name = '';
          for (const p of parts) {
            const cleaned = p.trim();
            if (cleaned.length > 3 && /[A-Z]/.test(cleaned) && !/^\d+$/.test(cleaned)) {
              name = cleaned;
              break;
            }
          }
          
          if (name) {
            seenUpcs.add(upc);
            allItems.push({ upc, name, source: 'new_pdf' });
          }
        }
      }
      
      if (extracted % 20 === 0) {
        console.log(`Extracted ${extracted}/${pdfFiles.length} PDFs, found ${allItems.length} UPCs...`);
      }
    } catch (err) {
      failed++;
    }
  }

  console.log(`\nDone! Extracted: ${extracted}, Failed: ${failed}`);
  console.log(`Total unique UPCs from new PDFs: ${allItems.length}`);

  fs.writeFileSync('./new_pdf_upcs.json', JSON.stringify(allItems, null, 2));
}

main().catch(console.error);
