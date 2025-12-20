const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

async function extractTextFromPDF(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const uint8Array = new Uint8Array(dataBuffer);
  
  const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText;
}

async function extractUPCs() {
  const pdfDir = path.join(__dirname, 'attached_assets');
  const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
  
  console.log(`Found ${pdfFiles.length} PDF files`);
  
  const allEntries = [];
  const seenUPCs = new Set();
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of pdfFiles) {
    try {
      const pdfPath = path.join(pdfDir, file);
      const text = await extractTextFromPDF(pdfPath);
      
      // Find all 12-14 digit numbers (UPCs/EANs)
      const upcMatches = text.match(/\b\d{12,14}\b/g) || [];
      
      for (const upc of upcMatches) {
        if (!seenUPCs.has(upc)) {
          seenUPCs.add(upc);
          
          // Try to find associated description nearby
          const descPattern = new RegExp(`${upc}[^\\n]*?([A-Z]{2,4}\\s+[A-Z0-9\\s\\-\\/\\.]+)`, 'i');
          const descMatch = text.match(descPattern);
          
          allEntries.push({
            upc,
            description: descMatch ? descMatch[1].trim() : '',
            source: file
          });
        }
      }
      
      successCount++;
      if (successCount % 10 === 0) {
        console.log(`Processed ${successCount}/${pdfFiles.length} PDFs: ${allEntries.length} unique UPCs`);
      }
    } catch (err) {
      errorCount++;
      if (errorCount <= 5) {
        console.error(`Error in ${file}: ${err.message}`);
      }
    }
  }
  
  console.log(`\nSuccess: ${successCount}, Errors: ${errorCount}`);
  console.log(`Total unique UPCs: ${allEntries.length}`);
  
  const outputPath = '/tmp/extracted_invoice_upcs.json';
  fs.writeFileSync(outputPath, JSON.stringify(allEntries, null, 2));
  console.log(`Saved to ${outputPath}`);
  
  // Sample entries
  console.log('\nSample entries:');
  allEntries.slice(0, 10).forEach(e => console.log(`  ${e.upc}: ${e.description.substring(0, 50)}`));
  
  return allEntries;
}

extractUPCs().catch(console.error);
