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

async function extractPennPlaxUPCs() {
  const pdfDir = path.join(__dirname, 'attached_assets');
  const pdfFiles = fs.readdirSync(pdfDir)
    .filter(f => f.endsWith('.pdf') && f.startsWith('order_'));
  
  console.log(`Found ${pdfFiles.length} Penn Plax order PDFs`);
  
  const allEntries = [];
  const seenUPCs = new Set();
  const processedOrders = new Set();
  
  for (const file of pdfFiles) {
    // Skip duplicates - extract base order number
    const orderMatch = file.match(/order_(\d+)/);
    if (!orderMatch) continue;
    const orderId = orderMatch[1];
    
    // Only process first instance of each order
    if (processedOrders.has(orderId)) continue;
    processedOrders.add(orderId);
    
    try {
      const pdfPath = path.join(pdfDir, file);
      const text = await extractTextFromPDF(pdfPath);
      
      // Penn Plax format: Product Name followed by 12-digit UPC
      // Pattern: text before 12-digit number starting with 030172 or 713733
      const lines = text.split(/\s+/);
      
      for (let i = 0; i < lines.length; i++) {
        const token = lines[i];
        // Penn Plax UPCs: 030172xxxxxx, E2 UPCs: 713733xxxxxx
        if (/^(030172|713733)\d{6}$/.test(token)) {
          const upc = token;
          if (!seenUPCs.has(upc)) {
            seenUPCs.add(upc);
            
            // Get preceding text as product name (up to 10 tokens back)
            let nameTokens = [];
            for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
              const prevToken = lines[j];
              // Stop at prices, quantities, or other UPCs
              if (/^\$?\d+\.\d{2}$/.test(prevToken)) break;
              if (/^\d{12}$/.test(prevToken)) break;
              if (prevToken === 'Total' || prevToken === 'Price' || prevToken === 'Qty') break;
              nameTokens.unshift(prevToken);
            }
            
            const productName = nameTokens.join(' ').trim();
            
            allEntries.push({
              upc,
              productName,
              source: file,
              orderId
            });
          }
        }
      }
      
      console.log(`Order ${orderId}: ${allEntries.length} UPCs so far`);
    } catch (err) {
      console.error(`Error in ${file}: ${err.message}`);
    }
  }
  
  console.log(`\nProcessed ${processedOrders.size} unique orders`);
  console.log(`Total unique UPCs: ${allEntries.length}`);
  
  // Save results
  const outputPath = '/tmp/pennplax_upcs.json';
  fs.writeFileSync(outputPath, JSON.stringify(allEntries, null, 2));
  console.log(`Saved to ${outputPath}`);
  
  // Show samples
  console.log('\nSample entries:');
  allEntries.slice(0, 15).forEach(e => {
    console.log(`  ${e.upc}: ${e.productName.substring(0, 60)}`);
  });
  
  // Show prefix distribution
  const prefixes = {};
  allEntries.forEach(e => {
    const prefix = e.upc.substring(0, 6);
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
  });
  console.log('\nUPC prefix distribution:');
  Object.entries(prefixes).forEach(([prefix, count]) => {
    console.log(`  ${prefix}: ${count} UPCs`);
  });
  
  return allEntries;
}

extractPennPlaxUPCs().catch(console.error);
