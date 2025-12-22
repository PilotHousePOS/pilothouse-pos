import fs from 'fs';
import path from 'path';

console.log('=== COMPREHENSIVE RESCAN OF ALL INVOICE DATA ===\n');

const allDirs = [
  'attached_assets/extracted_orders',
  'attached_assets/extracted_orders2',
  'attached_assets/extracted_orders3',
  'attached_assets/extracted_orders4',
  'attached_assets/extracted_orders5',
  'attached_assets/extracted_orders6',
  'attached_assets/extracted_orders7',
  'attached_assets/extracted_new'
];

const allItems = new Map();
const brandPatterns = {
  oxbow: [/^oxb\s/i, /oxbow/i],
  smartbones: [/smbn/i, /smartbone/i, /smart.*bone/i],
  benebone: [/^ben\s/i, /benebone/i],
  barkworthies: [/^bwi\s/i, /barkworth/i],
  pennplax: [/^pnp\s/i, /penn.?plax/i],
  zoomed: [/^zml\s/i, /zoo.?med/i],
  kaytee: [/^kay\s/i, /kaytee/i],
  tetra: [/^tet\s/i, /tetra/i],
  hikari: [/^hik\s/i, /hikari/i],
  fluval: [/^flv\s/i, /fluval/i],
  api: [/^api\s/i],
  coastal: [/^coa\s/i, /coastal/i],
  kong: [/^kon\s/i, /kong/i],
  greenies: [/^gre\s/i, /greenies/i],
  nylabone: [/^nyl\s/i, /nylabone/i],
  redbarn: [/^rbp\s/i, /redbarn/i],
  nutrisource: [/^nsr\s/i, /nutrisource/i],
  wellness: [/^wel\s/i, /wellness/i],
  merrick: [/^mer\s/i, /merrick/i],
  iams: [/^iam\s/i, /iams/i],
  royalcanin: [/^rc\s/i, /royal.?canin/i],
  sciencediet: [/^sd\s/i, /science.?diet/i, /hills/i],
  bluebuffalo: [/^bb\s/i, /blue.?buffalo/i],
  purina: [/^pur\s/i, /purina/i, /pro.?plan/i],
  friskies: [/^frk\s/i, /friskies/i],
  fancy: [/^fnc\s/i, /fancy.?feast/i],
};

function detectBrand(desc) {
  const descLower = desc.toLowerCase();
  for (const [brand, patterns] of Object.entries(brandPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(desc)) return brand;
    }
  }
  return '';
}

// Pattern 1: Central Pet format - LINE/REL PRODUCT UPC DESCRIPTION EA
const centralPattern = /^\s*\d+\/?\d*\s+\d{8}\s+(\d{12})\s+(.+?)\s+EA\s+/gm;

// Pattern 2: Phillips Pet format - UPC in structured table
const phillipsPattern = /(\d{12})\s+(\d+)\s+\d+\/\d+\/\d+/gm;

// Pattern 3: Standalone UPC with description
const standalonePattern = /^(\d{12})\s+([A-Z][A-Z0-9\s&\-\/\.#'"]+)$/gm;

// Pattern 4: Any 12-digit sequence that looks like UPC
const anyUpcPattern = /\b(\d{12})\b/g;

let totalFiles = 0;
let centralMatches = 0;
let phillipsMatches = 0;
let standaloneMatches = 0;

for (const dir of allDirs) {
  if (!fs.existsSync(dir)) continue;
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
  console.log(`Scanning ${files.length} files in ${dir}`);
  totalFiles += files.length;
  
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf-8');
    
    // Try Central Pet pattern
    let match;
    while ((match = centralPattern.exec(text)) !== null) {
      const upc = match[1];
      let desc = match[2].trim();
      // Remove VPN codes like AR-26, U-04428, etc.
      desc = desc.replace(/^[A-Z0-9]+-[A-Z0-9]+\s+/, '');
      
      if (desc.length > 3 && !allItems.has(upc)) {
        allItems.set(upc, { 
          upc, 
          name: desc, 
          brand: detectBrand(desc),
          source: 'central',
          file 
        });
        centralMatches++;
      }
    }
    centralPattern.lastIndex = 0;
    
    // Try standalone pattern
    while ((match = standalonePattern.exec(text)) !== null) {
      const upc = match[1];
      const desc = match[2].trim();
      
      if (desc.length > 5 && !allItems.has(upc)) {
        allItems.set(upc, {
          upc,
          name: desc,
          brand: detectBrand(desc),
          source: 'standalone',
          file
        });
        standaloneMatches++;
      }
    }
    standalonePattern.lastIndex = 0;
  }
}

console.log(`\nTotal files scanned: ${totalFiles}`);
console.log(`Total unique UPCs found: ${allItems.size}`);
console.log(`  Central Pet matches: ${centralMatches}`);
console.log(`  Standalone matches: ${standaloneMatches}`);

// Count by brand
const brandCounts = {};
for (const [upc, item] of allItems) {
  if (item.brand) {
    brandCounts[item.brand] = (brandCounts[item.brand] || 0) + 1;
  }
}

console.log('\n=== BRANDS FOUND ===');
Object.entries(brandCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([brand, count]) => console.log(`  ${brand}: ${count}`));

// Save all extracted UPCs
const output = Array.from(allItems.values());
fs.writeFileSync('scripts/all_invoice_upcs.json', JSON.stringify(output, null, 2));
console.log(`\nSaved ${output.length} items to scripts/all_invoice_upcs.json`);

// Show target brands
console.log('\n=== TARGET BRAND DETAILS ===');
const targets = ['oxbow', 'smartbones', 'benebone', 'barkworthies'];
for (const target of targets) {
  const items = output.filter(i => i.brand === target);
  console.log(`\n${target.toUpperCase()} (${items.length}):`);
  items.forEach(i => console.log(`  ${i.upc} -> ${i.name}`));
}
