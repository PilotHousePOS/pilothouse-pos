import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const targetBrands = ['oxbow', 'oxb', 'smartbone', 'smrtbn', 'benebone', 'bnbone', 'barkworth', 'brkwth'];

async function extractFromPdf(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (err) {
    console.error(`Error parsing ${pdfPath}: ${err.message}`);
    return '';
  }
}

// Parse Central Pet invoice format - find UPC and description pairs
function parseInvoiceText(text) {
  const items = [];
  const lines = text.split('\n');
  
  // Central Pet format has structured lines like:
  // LINE/REL PRODUCT UPC VPN DESCRIPTION UM QTY LIST NET EXT
  const linePattern = /^\s*(\d+\/?\d*)\s+(\d{8})\s+(\d{12})\s+(\S*)\s+(.+?)\s+EA\s+/;
  
  for (const line of lines) {
    const match = line.match(linePattern);
    if (match) {
      const [, lineNum, productCode, upc, vpn, description] = match;
      items.push({
        upc: upc.padStart(12, '0'),
        description: description.trim(),
        productCode,
        vpn: vpn || ''
      });
    }
  }
  
  // Also try standalone UPC patterns
  const simplePattern = /(\d{12})\s+\S*\s+([A-Z][A-Z0-9\s&\-\/\.#'"]+)/g;
  let simpleMatch;
  while ((simpleMatch = simplePattern.exec(text)) !== null) {
    const upc = simpleMatch[1];
    const desc = simpleMatch[2].trim();
    if (!items.some(i => i.upc === upc) && desc.length > 3) {
      items.push({ upc, description: desc, productCode: '', vpn: '' });
    }
  }
  
  return items;
}

async function main() {
  console.log('=== RE-EXTRACTING PDF INVOICES ===\n');
  
  const rawPdfs = fs.readdirSync('attached_assets')
    .filter(f => f.endsWith('.pdf'))
    .map(f => path.join('attached_assets', f));
  
  console.log(`Found ${rawPdfs.length} PDF files`);
  
  const allItems = new Map();
  const brandItems = [];
  
  let processed = 0;
  for (const pdfPath of rawPdfs) {
    processed++;
    if (processed % 20 === 0) console.log(`  Processing ${processed}/${rawPdfs.length}...`);
    
    const text = await extractFromPdf(pdfPath);
    const items = parseInvoiceText(text);
    
    for (const item of items) {
      if (!allItems.has(item.upc)) {
        allItems.set(item.upc, item);
        
        const descLower = item.description.toLowerCase();
        if (targetBrands.some(b => descLower.includes(b))) {
          brandItems.push(item);
        }
      }
    }
  }
  
  console.log(`\nExtracted ${allItems.size} unique UPCs`);
  console.log(`Found ${brandItems.length} target brand items`);
  
  if (brandItems.length > 0) {
    console.log('\n=== TARGET BRANDS FOUND ===');
    for (const item of brandItems) {
      console.log(`  ${item.upc} -> ${item.description}`);
    }
  }
  
  fs.writeFileSync('scripts/pdf_extracted_upcs.json', JSON.stringify(Array.from(allItems.values()), null, 2));
  console.log(`\nSaved to scripts/pdf_extracted_upcs.json`);
}

main().catch(console.error);
