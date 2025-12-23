import fs from 'fs';

const BRAND_PREFIXES = {
  'aqe': 'Aqueon', 'aqa': 'Aqueon', 'tet': 'Tetra', 'mar': 'Marineland', 'flv': 'Fluval',
  'scm': 'SeaChem', 'sli': 'SeaChem', 'hkr': 'Hikari', 'hik': 'Hikari', 'api': 'API',
  'zmd': 'Zoo Med', 'zm': 'Zoo Med', 'exo': 'Exo Terra', 'zil': 'Zilla', 
  'flk': 'Flukers', 'fluk': 'Flukers', 'pge': 'Pangea', 'kom': 'Komodo',
  'kon': 'Kong', 'kng': 'Kong', 'cst': 'Coastal', 'coa': 'Coastal', 'coastal': 'Coastal',
  'nyl': 'Nylabone', 'ben': 'Benebone', 'smb': 'SmartBones', 'smbn': 'SmartBones',
  'rdb': 'RedBarn', 'rbp': 'RedBarn', 'redbarn': 'RedBarn', 'grn': 'Greenies',
  'spt': 'Spot', 'jwp': 'JW Pet', 'jw': 'JW Pet', 'saf': 'Safari',
  'trc': 'TropiClean', 'trp': 'TropiClean', 'frp': 'Four Paws', 'fou': 'Four Paws',
  'nvt': 'NaturVet', 'pts': 'Petmate', 'dos': 'Petmate', 'petmate': 'Petmate',
  'mps': 'Multipet', 'mrp': 'Multipet', 'mul': 'Multipet',
  'tuf': 'Tuffy', 'vip': 'Tuffy', 'tuffy': 'Tuffy',
  'kay': 'Kaytee', 'oxb': 'Oxbow', 'vtk': 'Vitakraft', 'zup': 'ZuPreem',
  'sd': 'Science Diet', 'hsd': 'Science Diet',
  'bb': 'Blue Buffalo', 'blu': 'Blue Buffalo', 'blue': 'Blue Buffalo',
  'rc': 'Royal Canin', 'nut': 'Nutrisource', 'nbs': 'Nutrisource',
  'frm': 'Fromm', 'fromm': 'Fromm', 'dia': 'Diamond', 'diam': 'Diamond',
  'pp': 'Pro Plan', 'pro': 'Pro Plan',
  'tas': 'Taste of the Wild', 'tow': 'Taste of the Wild',
  'prim': 'Primal', 'primal': 'Primal',
  'ins': 'Instinct', 'vit': 'Vital Essentials',
  'lov': 'Loving Pets', 'loving': 'Loving Pets',
  'penn': 'Penn-Plax', 'pennplax': 'Penn-Plax',
  'marina': 'Marina', 'fluker': 'Flukers', 'flukers': 'Flukers',
  'zilla': 'Zilla', 'earthborn': 'Earthborn', 'orijen': 'Orijen', 'acana': 'Acana',
  'wellness': 'Wellness', 'welln': 'Wellness', 'canidae': 'Canidae', 'canid': 'Canidae',
  'nutro': 'Nutro', 'merrick': 'Merrick', 'weruva': 'Weruva',
  'zignature': 'Zignature', 'zign': 'Zignature',
  'sportmix': 'SportMix', 'valu': 'Valu-Pak',
  'freshpet': 'Freshpet', 'fussie': 'Fussie Cat',
};

function detectBrand(name) {
  if (!name) return 'UNKNOWN';
  const lower = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = lower.split(/\s+/);
  
  // Check first word
  if (words[0] && BRAND_PREFIXES[words[0]]) {
    return BRAND_PREFIXES[words[0]];
  }
  
  // Check first few characters
  for (const [prefix, brand] of Object.entries(BRAND_PREFIXES)) {
    if (lower.startsWith(prefix + ' ') || lower.startsWith(prefix + '-')) {
      return brand;
    }
  }
  
  // Check if any brand name appears in the text
  for (const [prefix, brand] of Object.entries(BRAND_PREFIXES)) {
    if (prefix.length > 4 && lower.includes(prefix)) {
      return brand;
    }
  }
  
  return 'UNKNOWN';
}

// Load master and new UPCs
const master = JSON.parse(fs.readFileSync('scripts/ALL_UPCS_EXPANDED.json'));
const newUpcs = JSON.parse(fs.readFileSync('scripts/new_upcs_to_add.json'));

console.log('Master UPCs:', master.length);
console.log('New UPCs to add:', newUpcs.length);

const masterSet = new Set(master.map(u => u.upc));
let added = 0;

for (const upc of newUpcs) {
  if (!masterSet.has(upc.upc)) {
    const name = upc.name || upc.name_original || upc.description || '';
    master.push({
      upc: upc.upc,
      name_original: name,
      brand: detectBrand(name),
      source: 'expanded_sources'
    });
    masterSet.add(upc.upc);
    added++;
  }
}

console.log('Added:', added);
console.log('New total:', master.length);

// Save expanded master
fs.writeFileSync('scripts/ALL_UPCS_EXPANDED.json', JSON.stringify(master, null, 2));
console.log('Saved to ALL_UPCS_EXPANDED.json');

// Brand stats
const brands = {};
master.forEach(u => {
  brands[u.brand] = (brands[u.brand] || 0) + 1;
});
const sorted = Object.entries(brands).sort((a,b) => b[1] - a[1]);
console.log('\nTop brands:');
sorted.slice(0, 15).forEach(([b, c]) => console.log('  ' + b + ': ' + c));
