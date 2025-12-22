import fs from 'fs';
import path from 'path';

const targetBrands = ['oxbow', 'oxb', 'smartbone', 'smrtbn', 'benebone', 'bnbone', 'barkworth', 'brkwth'];

function parseExtractedText(text, filename) {
  const items = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  // Build maps of UPCs and descriptions we find
  const upcs = [];
  const descriptions = [];
  
  for (const line of lines) {
    // Find 12-digit UPCs
    const upcMatch = line.match(/^(\d{12})$/);
    if (upcMatch) {
      upcs.push(upcMatch[1]);
      continue;
    }
    
    // Find product descriptions (start with brand abbreviation)
    if (/^[A-Z]{2,4}\s+[A-Z]/.test(line) && line.length > 5 && line.length < 60) {
      descriptions.push(line);
    }
  }
  
  // Central Pet line format (when on same line)
  const linePattern = /\d+\/\d*\s+\d{8}\s+(\d{12})\s+\S*\s+(.+?)\s+EA/g;
  let match;
  while ((match = linePattern.exec(text)) !== null) {
    items.push({ upc: match[1], description: match[2].trim(), source: filename, method: 'inline' });
  }
  
  return { items, upcs, descriptions };
}

async function main() {
  console.log('=== PARSING EXISTING EXTRACTED TEXT FILES ===\n');
  
  const dirs = [
    'attached_assets/extracted_orders',
    'attached_assets/extracted_orders2', 
    'attached_assets/extracted_orders3',
    'attached_assets/extracted_new'
  ];
  
  const allItems = new Map();
  const brandMentions = { oxbow: [], smartbones: [], benebone: [], barkworthies: [] };
  let totalUpcs = 0;
  let totalDescriptions = 0;
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    console.log(`Processing ${files.length} files in ${dir}`);
    
    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), 'utf-8');
      const { items, upcs, descriptions } = parseExtractedText(text, file);
      
      totalUpcs += upcs.length;
      totalDescriptions += descriptions.length;
      
      // Find brand mentions in descriptions
      for (const desc of descriptions) {
        const descLower = desc.toLowerCase();
        if (descLower.includes('oxb') || descLower.includes('oxbow')) {
          brandMentions.oxbow.push({ file, desc });
        }
        if (descLower.includes('smrtbn') || descLower.includes('smartbone')) {
          brandMentions.smartbones.push({ file, desc });
        }
        if (descLower.includes('bnbone') || descLower.includes('benebone')) {
          brandMentions.benebone.push({ file, desc });
        }
        if (descLower.includes('brkwth') || descLower.includes('barkworth')) {
          brandMentions.barkworthies.push({ file, desc });
        }
      }
      
      for (const item of items) {
        if (!allItems.has(item.upc)) {
          allItems.set(item.upc, item);
        }
      }
    }
  }
  
  console.log(`\nTotal UPCs found: ${totalUpcs}`);
  console.log(`Total descriptions found: ${totalDescriptions}`);
  console.log(`Inline matched items: ${allItems.size}`);
  
  console.log('\n=== BRAND MENTIONS IN DESCRIPTIONS ===');
  console.log(`Oxbow: ${brandMentions.oxbow.length}`);
  brandMentions.oxbow.slice(0, 10).forEach(m => console.log(`  ${m.desc}`));
  
  console.log(`\nSmartBones: ${brandMentions.smartbones.length}`);
  brandMentions.smartbones.slice(0, 5).forEach(m => console.log(`  ${m.desc}`));
  
  console.log(`\nBenebone: ${brandMentions.benebone.length}`);
  brandMentions.benebone.slice(0, 5).forEach(m => console.log(`  ${m.desc}`));
  
  console.log(`\nBarkworthies: ${brandMentions.barkworthies.length}`);
  brandMentions.barkworthies.slice(0, 5).forEach(m => console.log(`  ${m.desc}`));
  
  // Save brand mentions for manual review
  fs.writeFileSync('scripts/brand_mentions.json', JSON.stringify(brandMentions, null, 2));
  console.log('\nSaved brand mentions to scripts/brand_mentions.json');
}

main().catch(console.error);
