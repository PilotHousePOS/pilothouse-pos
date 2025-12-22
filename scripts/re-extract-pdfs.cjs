const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const targetBrands = ['oxbow', 'oxb ', 'smartbone', 'smrtbn', 'benebone', 'bnbone', 'barkworth', 'brkwth'];

async function extractFromPdf(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (err) {
    return '';
  }
}

function parseInvoiceText(text, filename) {
  const items = [];
  
  // Central Pet format: LINE/REL PRODUCT UPC VPN DESCRIPTION...
  const linePattern = /\s*\d+\/?\d*\s+\d{8}\s+(\d{12})\s+\S*\s+(.+?)\s+EA\s+/g;
  let match;
  while ((match = linePattern.exec(text)) !== null) {
    items.push({ upc: match[1], description: match[2].trim(), source: filename });
  }
  
  // Try alternate patterns for different invoice formats
  const altPattern = /(\d{12})\s+([A-Z]{2,3}[\s\-][A-Z0-9\s&\-\/\.#'"]+?)(?=\s+EA|\s+\d|$)/g;
  while ((match = altPattern.exec(text)) !== null) {
    const upc = match[1];
    const desc = match[2].trim();
    if (!items.some(i => i.upc === upc) && desc.length > 5) {
      items.push({ upc, description: desc, source: filename });
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
  let totalText = '';
  
  let processed = 0;
  for (const pdfPath of rawPdfs) {
    processed++;
    if (processed % 20 === 0) console.log(`  Processing ${processed}/${rawPdfs.length}...`);
    
    const text = await extractFromPdf(pdfPath);
    totalText += text + '\n';
    const items = parseInvoiceText(text, path.basename(pdfPath));
    
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
  
  console.log(`\nExtracted ${allItems.size} unique UPCs from PDFs`);
  console.log(`Found ${brandItems.length} target brand items`);
  
  // Also search raw text for brand mentions
  console.log('\n=== SEARCHING RAW TEXT FOR BRANDS ===');
  const brandMentions = [];
  for (const brand of ['OXBOW', 'OXB ', 'SMARTBONE', 'BENEBONE', 'BARKWORTH']) {
    const count = (totalText.match(new RegExp(brand, 'gi')) || []).length;
    if (count > 0) {
      console.log(`  ${brand}: ${count} mentions`);
      brandMentions.push({ brand, count });
    }
  }
  
  if (brandItems.length > 0) {
    console.log('\n=== TARGET BRANDS FOUND WITH UPCs ===');
    for (const item of brandItems) {
      console.log(`  ${item.upc} -> ${item.description}`);
    }
  }
  
  fs.writeFileSync('scripts/pdf_extracted_upcs.json', JSON.stringify(Array.from(allItems.values()), null, 2));
  console.log(`\nSaved ${allItems.size} items to scripts/pdf_extracted_upcs.json`);
  
  // Save raw text search results for debugging
  fs.writeFileSync('/tmp/pdf_raw_text_sample.txt', totalText.slice(0, 50000));
}

main().catch(console.error);
