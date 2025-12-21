const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function main() {
  const pdfDir = './attached_assets';
  const pdfFiles = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
  
  // Try first 3 PDFs and show errors
  for (let i = 0; i < 3 && i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    console.log(`\nTrying: ${file}`);
    
    try {
      const dataBuffer = fs.readFileSync(path.join(pdfDir, file));
      console.log(`  File size: ${dataBuffer.length} bytes`);
      
      const data = await pdfParse(dataBuffer);
      console.log(`  Pages: ${data.numpages}`);
      console.log(`  Text length: ${data.text.length}`);
      console.log(`  First 200 chars: ${data.text.substring(0, 200)}`);
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }
}

main().catch(console.error);
