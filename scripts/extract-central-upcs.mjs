import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== EXTRACTING UPCs FROM CENTRAL PET INVOICES ===\n');
  
  const dirs = [
    'attached_assets/extracted_orders',
    'attached_assets/extracted_orders2',
    'attached_assets/extracted_orders3'
  ];
  
  const allItems = new Map();
  const brandItems = { oxbow: [], smartbones: [], benebone: [], barkworthies: [], pennplax: [] };
  
  const linePattern = /^\s*\d+\/?\d*\s+\d{8}\s+(\d{12})\s+(.+?)\s+EA\s+/gm;
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    
    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), 'utf-8');
      
      let match;
      while ((match = linePattern.exec(text)) !== null) {
        const upc = match[1];
        let desc = match[2].trim();
        desc = desc.replace(/^[A-Z0-9]+-[A-Z0-9]+\s+/, '');
        
        if (!allItems.has(upc)) {
          allItems.set(upc, { upc, description: desc, file });
          
          const descLower = desc.toLowerCase();
          // Oxbow: OXB prefix
          if (descLower.startsWith('oxb ') || descLower.includes('oxbow')) {
            brandItems.oxbow.push({ upc, description: desc });
          }
          // SmartBones: SMBN in description
          if (descLower.includes('smbn') || descLower.includes('smartbone')) {
            brandItems.smartbones.push({ upc, description: desc });
          }
          // Benebone: BEN prefix
          if (descLower.startsWith('ben ') || descLower.includes('benebone')) {
            brandItems.benebone.push({ upc, description: desc });
          }
          // Barkworthies: BWI prefix (not BRKW which is breakaway)
          if (descLower.startsWith('bwi ') || descLower.includes('barkworth')) {
            brandItems.barkworthies.push({ upc, description: desc });
          }
          // Penn-Plax: PNP prefix
          if (descLower.startsWith('pnp ')) {
            brandItems.pennplax.push({ upc, description: desc });
          }
        }
      }
      linePattern.lastIndex = 0;
    }
  }
  
  console.log(`Total unique UPCs extracted: ${allItems.size}`);
  
  console.log('\n=== TARGET BRANDS ===');
  console.log(`Oxbow: ${brandItems.oxbow.length}`);
  console.log(`SmartBones: ${brandItems.smartbones.length}`);
  brandItems.smartbones.forEach(i => console.log(`  ${i.upc} -> ${i.description}`));
  console.log(`Benebone: ${brandItems.benebone.length}`);
  console.log(`Barkworthies: ${brandItems.barkworthies.length}`);
  console.log(`Penn-Plax: ${brandItems.pennplax.length}`);
  
  // Merge into master index
  console.log('\n=== MERGING INTO MASTER INDEX ===');
  const masterPath = 'scripts/master_upc_index.json';
  const master = JSON.parse(fs.readFileSync(masterPath, 'utf-8'));
  const existingUpcs = new Set(master.map(e => e.upc));
  
  let added = 0;
  for (const [upc, item] of allItems) {
    if (!existingUpcs.has(upc)) {
      const brand = brandItems.oxbow.some(b => b.upc === upc) ? 'oxbow' :
                    brandItems.smartbones.some(b => b.upc === upc) ? 'smartbones' :
                    brandItems.benebone.some(b => b.upc === upc) ? 'benebone' :
                    brandItems.barkworthies.some(b => b.upc === upc) ? 'barkworthies' :
                    brandItems.pennplax.some(b => b.upc === upc) ? 'pennplax' : '';
      
      master.push({ upc, name: item.description, brand, source: 'central_pet' });
      added++;
    }
  }
  
  fs.writeFileSync(masterPath, JSON.stringify(master, null, 2));
  console.log(`Added ${added} new entries to master index`);
  console.log(`Master index now has ${master.length} entries`);
  
  // Count target brands in master
  const oxbowInMaster = master.filter(e => e.brand === 'oxbow').length;
  const smartbonesInMaster = master.filter(e => e.brand === 'smartbones').length;
  const beneboneInMaster = master.filter(e => e.brand === 'benebone').length;
  console.log(`\nTarget brands in master:`);
  console.log(`  Oxbow: ${oxbowInMaster}`);
  console.log(`  SmartBones: ${smartbonesInMaster}`);
  console.log(`  Benebone: ${beneboneInMaster}`);
}

main().catch(console.error);
