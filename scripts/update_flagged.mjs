import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scripts/FLAGGED_ALL_UPCS.json', 'utf-8'));

// Extended brand prefix mapping
const PREFIX_MAP = {
  // Original
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
  'NYL': 'Nylabone', 'NYLABONE': 'Nylabone', 'NYLA': 'Nylabone',
  'FOU': 'Four Paws', 'FRP': 'Four Paws', 'FOURPAWS': 'Four Paws',
  'MAM': 'Mammoth', 'MAMMOTH': 'Mammoth', 'MAMM': 'Mammoth',
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
  'JWP': 'JW Pet', 'JW': 'JW Pet',
  'LOV': 'Loving Pets',
  'PH': 'Prevue',
  'AQUATOP': 'Aquatop', 'ATP': 'Aquatop',
  'PRIMAL': 'Primal',
  'DIAMOND': 'Diamond',
  'PETCREST': 'PetCrest',
  'VALHOMA': 'Valhoma',
  'SEACHEM': 'SeaChem',
  // New ones from UNKNOWN analysis
  'WWI': 'World Wide Imports',
  'RASCALS': 'Rascals',
  'CLI': 'Clifford',
  'MPF': 'MPF',
  'BAR': 'Barkworthies',
  'TURBO': 'Turbo',
  'AQA': 'Aqueon',
  'NATURESMIRACLE': 'Nature\'s Miracle',
  'HAPPY': 'Happy Beaks',
  'REPTOLOGY': 'Reptology',
  'ELA': 'Elanco',
  'KOM': 'Komodo', 'KOMODO': 'Komodo',
  'ADAMS': 'Adams',
  'CHUCKIT': 'Chuckit',
  'ORI': 'Orijen',
  'MFP': 'Marshall',
  'BELLABOWL': 'Bella Bowl',
  'FCF': 'Full Circle',
  'HLP': 'Healthy Pet',
  'SKOUTSHONOR': 'Skout\'s Honor',
  'PANGEA': 'Pangea',
  'QUIET': 'Quiet Time', 'QUIETTIME': 'Quiet Time',
  'VANNESS': 'Van Ness',
  'FRESHBREATHE': 'Fresh Breathe',
  'HIGGINS': 'Higgins',
  'MULTIPET': 'Multipet', 'MUL': 'Multipet',
  'NTN': 'Nutri-Vet',
  'SODAPUP': 'SodaPup',
  'BIOGROOM': 'Bio-Groom',
  'NATURE': 'Nature Zone',
  'SMP': 'SMP',
  'CRS': 'CaribSea',
  'ACA': 'Acana',
  'AGA': 'Aqueon',
  'DURVET': 'Durvet',
  'FELINE': 'Greenies',
  'MAGICCOAT': 'Magic Coat',
  'SMALL': 'Happy Beaks',
  'SPF': 'Supreme Pet Foods',
  'SWEETHARVEST': 'Sweet Harvest',
  'VITAPOL': 'Vitapol',
};

// Update brand assignments
let updated = 0;
data.forEach(d => {
  const firstWord = d.name.split(' ')[0].toUpperCase();
  if (PREFIX_MAP[firstWord]) {
    if (d.brand === 'UNKNOWN') updated++;
    d.brand = PREFIX_MAP[firstWord];
  }
});

// Save updated file
fs.writeFileSync('scripts/FLAGGED_ALL_UPCS.json', JSON.stringify(data, null, 2));
console.log('Updated', updated, 'UNKNOWN entries');

// Summary
const brandCounts = {};
data.forEach(f => {
  brandCounts[f.brand] = (brandCounts[f.brand] || 0) + 1;
});

console.log('\n=== UPDATED UPCs BY BRAND ===');
console.log('Total entries:', data.length);
console.log('UNKNOWN remaining:', brandCounts['UNKNOWN'] || 0);

Object.entries(brandCounts)
  .sort((a,b) => b[1] - a[1])
  .slice(0, 30)
  .forEach(([brand, count]) => console.log(brand + ': ' + count));
