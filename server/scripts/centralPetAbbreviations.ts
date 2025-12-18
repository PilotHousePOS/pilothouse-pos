// Central Pet Dallas abbreviation expansions

export const brandAbbreviations: Record<string, string> = {
  'AQE': 'Aqueon',
  'API': 'API',
  'ATP': 'Aquatop',
  'ZML': 'Zoo Med',
  'ZMD': 'Zoo Med',
  'AEC': 'A&E Cage',
  'A&E': 'A&E Cage',
  'HIK': 'Hikari',
  'TET': 'Tetra',
  'SLI': 'Seachem',
  'FLU': 'Fluker\'s',
  'ZIL': 'Zilla',
  'KOM': 'Komodo',
  'COA': 'Coastal',
  'ETH': 'Ethical Pet',
  'BLI': 'Bergan',
  'NYL': 'Nylabone',
  'KAY': 'Kaytee',
  'KMP': 'Kaytee',
  'JWP': 'JW Pet',
  'KON': 'Kong',
  'ZUP': 'ZuPreem',
  'EPC': 'Litter Genie',
  'N/M': 'Nature\'s Miracle',
  'NZP': 'Natural Chemistry',
  'WWI': 'Worldwide',
  'MAR': 'Marineland',
  'MBL': 'Marineland',
  'VIT': 'Vitakraft',
  'SUP': 'Super Pet',
  'OXB': 'Oxbow',
  'LIV': 'Living World',
  'CAR': 'Carib Sea',
  'CBS': 'Carib Sea',
  'GAL': 'Galapagos',
  'REP': 'Rep-Cal',
  'EXO': 'Exo Terra',
  'BEN': 'Benebone',
  'BAR': 'Barkworthies',
  'BDL': 'Bodhi Dog',
  'BDE': 'Bodhi Dog',
  'ASP': 'Aspen Pet',
  'AGA': 'Aqueon',
  'AQA': 'Aquatop',
};

export const wordAbbreviations: Record<string, string> = {
  // Product types
  'CCHLD': 'Cichlid',
  'COND': 'Conditioner',
  'GRVL': 'Gravel',
  'CLNR': 'Cleaner',
  'FXTR': 'Fixture',
  'FLTR': 'Filter',
  'CRTRDG': 'Cartridge',
  'PLLT': 'Pellet',
  'GRNLRS': 'Granules',
  'SHRMP': 'Shrimp',
  'TRPCL': 'Tropical',
  'SPLMT': 'Supplement',
  'TRTMNT': 'Treatment',
  'MED': 'Medicine',
  'PMP': 'Pump',
  'FDR': 'Feeder',
  'SBSTRT': 'Substrate',
  'ORNMT': 'Ornament',
  'TRT': 'Treat',
  'CHW': 'Chew',
  'CLLR': 'Collar',
  'T/O': 'Tie Out',
  'TEASR': 'Teaser',
  'LTTR': 'Litter',
  'BTTL': 'Bottle',
  'PTS': 'Pet',
  'BEDNG': 'Bedding',
  'RFILL': 'Refill',
  'HLTHY': 'Healthy',
  'EDBL': 'Edible',
  
  // Animals
  'HRMT': 'Hermit',
  'HAM': 'Hamster',
  'GERBIL': 'Gerbil',
  'TIEL': 'Cockatiel',
  'LVBR': 'Lovebird',
  'CHNCHL': 'Chinchilla',
  'KTTN': 'Kitten',
  'CT': 'Cat',
  'DG': 'Dog',
  
  // Equipment
  'VAC': 'Vacuum',
  'WTR': 'Water',
  'HNDL': 'Handle',
  'SCRPR': 'Scraper',
  'MAG': 'Magnetic',
  'PROSCRPR': 'Pro Scraper',
  'CRCLTN': 'Circulation',
  'QUICKCLN': 'Quick Clean',
  'CRNR': 'Corner',
  'STRY': 'Story',
  'ASSM': 'Assembly',
  'VLVE': 'Valve',
  'STRP': 'Strip',
  'HNGD': 'Hinged',
  
  // Materials/Types
  'NAT': 'Natural',
  'CUTBNE': 'Cuttlebone',
  'CERM': 'Ceramic',
  'INC': 'Incandescent',
  'PLSTC': 'Plastic',
  'RBBR': 'Rubber',
  'SLKR': 'Slicker',
  'LOOFAH': 'Loofah',
  
  // Flavors/Types
  'BCN': 'Bacon',
  'PB': 'Peanut Butter',
  'WSHBN': 'Wishbone',
  'STC': 'Stick',
  'SPRFD': 'Superfood',
  'BLBRY': 'Blueberry',
  'ORIG': 'Original',
  'GRMT': 'Gourmet',
  'SMKY': 'Smoky',
  'BOTANC': 'Botanical',
  'WNTR': 'Winter',
  'SPRNG': 'Spring',
  'GLOFSH': 'GloFish',
  'FLK': 'Flake',
  
  // Colors
  'WH': 'White',
  'BK': 'Black',
  'CLR': 'Clear',
  'BL': 'Blue',
  'RD': 'Red',
  'GRN': 'Green',
  'GY': 'Grey',
  'TP': 'Taupe',
  'BRY': 'Berry',
  'PK': 'Pink',
  
  // Sizes
  'SM': 'Small',
  'MD': 'Medium',
  'LG': 'Large',
  'XS': 'Extra Small',
  'XL': 'Extra Large',
  'GNT': 'Giant',
  'REG': 'Regular',
  'MINI': 'Mini',
  
  // Other
  'COMFT': 'Comfort',
  'ADJ': 'Adjustable',
  'CHTH': 'Cheetah',
  'NDT': 'No Dye',
  'LP': 'Loop',
  'RND': 'Round',
  'SQA': 'Sequin',
  'STW': 'Straw',
  'GRDN': 'Garden',
  'SAFE': 'Safe',
  'ALGAE': 'Algae',
  'AQUA': 'Aqua',
  'ESNTL': 'Essential',
  'AQCLR': 'Aqua Clear',
  'P/C': 'Pond Care',
  'FW': 'Freshwater',
  'S/W': 'Saltwater',
};

export function expandAbbreviations(abbrev: string): string {
  let expanded = abbrev;
  
  // First, try to expand the brand prefix
  const words = abbrev.split(/\s+/);
  if (words.length > 0) {
    const firstWord = words[0].toUpperCase();
    if (brandAbbreviations[firstWord]) {
      words[0] = brandAbbreviations[firstWord];
    }
  }
  
  // Then expand each word
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toUpperCase();
    if (wordAbbreviations[word]) {
      words[i] = wordAbbreviations[word];
    }
  }
  
  return words.join(' ');
}
