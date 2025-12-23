import fs from 'fs';

// Load both sources
const maybe = JSON.parse(fs.readFileSync('scripts/maybe_upcs_clean_3171.json', 'utf-8'));
const invoice = JSON.parse(fs.readFileSync('scripts/all_invoice_upcs.json', 'utf-8'));

console.log('Maybe inventory:', maybe.length);
console.log('Invoice data:', invoice.length);

// Combine - prefer maybe names (cleaner)
const allUpcs = new Map();

// Add maybe first
maybe.forEach(m => {
  allUpcs.set(m.upc, { upc: m.upc, name: m.name, source: 'maybe' });
});

// Add invoice (only if not in maybe)
invoice.forEach(i => {
  if (!allUpcs.has(i.upc)) {
    allUpcs.set(i.upc, { upc: i.upc, name: i.name, source: 'invoice' });
  }
});

console.log('Combined unique:', allUpcs.size);

// Brand prefix mapping
const PREFIX_MAP = {
  'COA': 'Coastal', 'COASTAL': 'Coastal', 'LILPALS': 'Li\'l Pals', 
  'ZOOMED': 'Zoo Med', 'ZML': 'Zoo Med',
  'EXOTERRA': 'Exo Terra', 'EXT': 'Exo Terra',
  'KNG': 'Kong', 'KONG': 'Kong', 'KON': 'Kong',
  'ZILLA': 'Zilla', 'ZIL': 'Zilla',
  'OXB': 'Oxbow', 'OXBOW': 'Oxbow',
  'AEC': 'Kaytee', 'KAY': 'Kaytee', 'KAYTEE': 'Kaytee',
  'AQE': 'Aqueon', 'AQUEON': 'Aqueon',
  'TET': 'Tetra', 'TETRA': 'Tetra',
  'BIRDLIFE': 'Birdlife',
  'PTS': 'Penn-Plax', 'PPX': 'Penn-Plax',
  'RBP': 'RedBarn', 'REDBARN': 'RedBarn',
  'SAFARI': 'Safari',
  'CATIT': 'Catit',
  'HIK': 'Hikari', 'HIKARI': 'Hikari',
  'FAS': 'Fashion Pet',
  'TROPICLEAN': 'TropiClean', 'TRO': 'TropiClean',
  'ETH': 'Ethical Pet', 'ETHCL': 'Ethical Pet',
  'TITAN': 'Titan',
  'CIRCLE': 'Circle',
  'GRE': 'Greenies', 'GREENIES': 'Greenies',
  'FLUKERS': 'Flukers', 'FLU': 'Flukers',
  'API': 'API',
  'PLAYFULS': 'Playfuls',
  'NATURVET': 'NaturVet',
  'WEEWEE': 'Wee-Wee',
  'NBP': 'Natural Balance',
  'PETMATE': 'Petmate', 'DOS': 'Petmate',
  'SLI': 'Seachem',
  'TUFFY': 'Tuffy',
  'NYL': 'Nylabone', 'NYLABONE': 'Nylabone',
  'FOU': 'Four Paws', 'FRP': 'Four Paws',
  'MAM': 'Mammoth',
  'MRN': 'Marineland', 'MARINA': 'Marina',
  'BEN': 'Benebone', 'BENEBONE': 'Benebone',
  'PMX': 'SmartBones', 'SMBN': 'SmartBones', 'SMARTBONES': 'SmartBones',
  'BWY': 'Barkworthies', 'BRKW': 'Barkworthies',
  'SD': 'Science Diet',
  'FROMM': 'Fromm',
  'NUTRI': 'Nutrisource',
  'BLUE': 'Blue Buffalo',
  'FLUVAL': 'Fluval',
  'PRV': 'Prevue', 'PREVUE': 'Prevue',
  'SPT': 'Spot', 'SPOT': 'Spot',
  'JWP': 'JW Pet',
  'LOV': 'Loving Pets',
  'PH': 'Prevue', // Prevue Hendryx
  'AQUATOP': 'Aquatop', 'ATP': 'Aquatop',
  'PRIMAL': 'Primal',
  'DIAMOND': 'Diamond',
  'PETCREST': 'PetCrest',
  'VALHOMA': 'Valhoma',
  'SEACHEM': 'SeaChem',
};

// Assign brand to each UPC
const flagged = [];
for (const [upc, data] of allUpcs) {
  const firstWord = data.name.split(' ')[0].toUpperCase();
  const brand = PREFIX_MAP[firstWord] || 'UNKNOWN';
  flagged.push({
    upc: upc,
    name: data.name,
    brand: brand,
    source: data.source
  });
}

// Sort by brand then name
flagged.sort((a, b) => {
  if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
  return a.name.localeCompare(b.name);
});

// Save flagged file
fs.writeFileSync('scripts/FLAGGED_ALL_UPCS.json', JSON.stringify(flagged, null, 2));
console.log('\nSaved FLAGGED_ALL_UPCS.json with', flagged.length, 'entries');

// Summary by brand
const brandCounts = {};
flagged.forEach(f => {
  brandCounts[f.brand] = (brandCounts[f.brand] || 0) + 1;
});

console.log('\n=== UPCs BY BRAND ===');
Object.entries(brandCounts)
  .sort((a,b) => b[1] - a[1])
  .forEach(([brand, count]) => console.log(brand + ': ' + count));
