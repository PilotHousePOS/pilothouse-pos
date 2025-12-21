const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

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
  
  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    const pdfPath = path.join(pdfDir, file);
    const txtPath = path.join(outputDir, file.replace('.pdf', '.txt'));
    
    // Skip if already extracted
    if (fs.existsSync(txtPath)) {
      continue;
    }
    
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(dataBuffer);
      fs.writeFileSync(txtPath, data.text);
      extracted++;
      
      if (extracted % 20 === 0) {
        console.log(`Extracted ${extracted} PDFs...`);
      }
    } catch (err) {
      failed++;
    }
  }
  
  console.log(`\nDone! Extracted: ${extracted}, Failed: ${failed}`);
}

main().catch(console.error);
