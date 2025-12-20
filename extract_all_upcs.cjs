const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function extractUPCs() {
  const pdfDir = path.join(__dirname, 'attached_assets');
  const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
  
  console.log(`Found ${pdfFiles.length} PDF files`);
  
  const allEntries = [];
  const seenUPCs = new Set();
  let successCount = 0;
  
  for (const file of pdfFiles) {
    try {
      const pdfPath = path.join(pdfDir, file);
      const dataBuffer = fs.readFileSync(pdfPath);
      
      const parser = new PDFParse();
      const data = await parser.parse(dataBuffer);
      
      const text = data.text || '';
      const lines = text.split('\n');
      
      for (const line of lines) {
        // Pattern: PRODUCT_ID   UPC   DESCRIPTION
        const match = line.match(/(\d{6,8})\s+(\d{12,14})\s+\*?([A-Z0-9\-]*)\s+(.+?)\s+(EA|DZ|CS|BX|PK)\s+/i);
        
        if (match) {
          const [, productId, upc, vpn, description] = match;
          
          if (!seenUPCs.has(upc)) {
            seenUPCs.add(upc);
            allEntries.push({
              productId,
              upc,
              vpn: vpn || '',
              description: description.trim(),
              source: file
            });
          }
        }
        
        // Also try simpler pattern for UPCs
        const simpleMatch = line.match(/\b(\d{12,14})\b/g);
        if (simpleMatch) {
          for (const upc of simpleMatch) {
            if (!seenUPCs.has(upc) && upc.length >= 12) {
              const descMatch = line.match(/[A-Z]{2,4}\s+[A-Z0-9\s\-\/\.]+/i);
              seenUPCs.add(upc);
              allEntries.push({
                upc,
                description: descMatch ? descMatch[0].trim() : '',
                source: file
              });
            }
          }
        }
      }
      
      successCount++;
      if (successCount % 10 === 0) {
        console.log(`Processed ${successCount} PDFs: ${allEntries.length} unique UPCs so far`);
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
    }
  }
  
  const outputPath = '/tmp/extracted_invoice_upcs.json';
  fs.writeFileSync(outputPath, JSON.stringify(allEntries, null, 2));
  console.log(`\nTotal unique UPCs extracted: ${allEntries.length}`);
  console.log(`Saved to ${outputPath}`);
  
  console.log('\nSample entries:');
  allEntries.slice(0, 10).forEach(e => {
    console.log(`  ${e.upc}: ${e.description}`);
  });
  
  return allEntries;
}

extractUPCs().catch(console.error);
