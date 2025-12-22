import fs from 'fs';
import path from 'path';
// @ts-ignore
import * as pdfParse from 'pdf-parse';
const pdf = pdfParse.default || pdfParse;

async function extractPDF(pdfPath: string): Promise<string> {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdf(dataBuffer);
  return data.text;
}

async function main() {
  const camScannerPDFs = [
    'attached_assets/CamScanner 11-20-2025 14.09_1763669952228.pdf',
    'attached_assets/CamScanner_12-19-2025_14.29_1766176312537.pdf',
    'attached_assets/CamScanner_12-20-2025_14.10_1766261631905.pdf',
    'attached_assets/CamScanner_12-20-2025_14.14_1766261933218.pdf',
    'attached_assets/CamScanner_12-20-2025_14.20_1766262242013.pdf',
    'attached_assets/CamScanner_12-20-2025_14.24_1766262326375.pdf',
  ];

  for (const pdfPath of camScannerPDFs) {
    console.log(`\n=== Extracting: ${pdfPath} ===`);
    try {
      const text = await extractPDF(pdfPath);
      console.log(`Length: ${text.length} characters`);
      console.log('First 500 chars:');
      console.log(text.substring(0, 500));
      
      // Look for potential UPCs
      const upcPattern = /\b\d{10,14}\b/g;
      const matches = text.match(upcPattern);
      if (matches) {
        console.log(`Found ${matches.length} potential UPCs`);
        console.log('Sample:', matches.slice(0, 5));
      } else {
        console.log('No UPC patterns found in text');
      }
    } catch (err) {
      console.log(`Error: ${err}`);
    }
  }
}

main();
