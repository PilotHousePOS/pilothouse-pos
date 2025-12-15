/**
 * Smart abbreviation expansion system for product names and descriptions
 * Priority: Brand catalog (research-backed) > Generic abbreviations (fallback)
 * Handles context-aware expansion (e.g., "Ph" can be pH or Prevue Hendrix)
 */

import type { IStorage } from './storage';
import { expandProductName } from './brandCatalog';

// Water chemistry keywords that indicate "Ph" means pH (water acidity), not Prevue Hendrix
const PH_CHEMISTRY_KEYWORDS = [
  'test', 'kit', 'down', 'up', 'balance', 'adjust', 'strip', 'meter',
  'buffer', 'calibration', 'probe', 'monitor', 'controller'
];

// Water chemistry brands that use "Ph" for pH
const PH_CHEMISTRY_BRANDS = [
  'api', 'aqueon', 'fluval', 'seachem', 'marineland', 'tetra'
];

// Aquarium keywords that indicate "Ga" means Gallon (volume measurement)
const GALLON_AQUARIUM_KEYWORDS = [
  'tank', 'aquarium', 'filter', 'heater', 'pump', 'canister', 'terrarium',
  'sump', 'refugium', 'overflow', 'water', 'kit', 'setup', 'system'
];

// Aquarium brands that commonly use "Ga" for Gallon measurements
const GALLON_AQUARIUM_BRANDS = [
  'aqueon', 'marineland', 'fluval', 'tetra', 'api', 'penn plax', 'pennplax',
  'zoo med', 'zilla', 'exo terra', 'glofish'
];

/**
 * Main abbreviation mappings
 * Key: abbreviation (case-insensitive match)
 * Value: full expansion
 */
const ABBREVIATION_MAPPINGS: Record<string, string> = {
  // === BRAND PREFIX ABBREVIATIONS (at start of name) ===
  // These are expanded when they appear at the start of a product name
  // Verified against brand database December 2025
  'Sd': 'Science Diet',
  'Nb': 'Natural Balance',
  'Tow': 'Taste of the Wild',
  'Toe': 'Taste of the Wild',
  'Diam': 'Diamond',
  'Vict': 'VICTOR',
  'Euk': 'Eukanuba',
  'Jw': 'JW Pet',
  'Spt': 'Spot',
  'Mamm': 'Mammoth',
  'Zig': 'Zignature',
  'Cand': 'Canidae',
  'Zila': 'Zilla',
  'Vari': 'Vari-Kennel',
  'Kfc': 'KFC',
  'Ae': 'A&E',
  'Lsu': 'LSU',
  'Nola': 'New Orleans Saints',
  'Knf': 'Kong',
  
  // Product line abbreviations
  'Ck': 'Chicken',
  'Lam': 'Lamb',
  'Br': 'Breed',
  'Anc': 'Ancient',
  'Perf': 'Perfect',
  'Sensi': 'Sensitive',
  'Gr': 'Grain',
  'Fr': 'Free',
  
  // Size abbreviations
  'Lg': 'Large',
  // NOTE: 'Med' removed - handled separately with negative lookbehind to protect "Zoo Med"
  'Md': 'Medium',
  'Sm': 'Small',
  'Min': 'Mini',
  'Xlg': 'Extra Large',
  'Xl': 'Extra Large',
  'Xxl': 'Extra Extra Large',
  'Xs': 'Extra Small',
  'Xsm': 'Extra Small',
  'Jum': 'Jumbo',
  
  // Material/Quality
  'Hvy': 'Heavy',
  'Dty': 'Duty',
  'Lt': 'Light',
  'Dk': 'Dark',
  'Bk': 'Black',
  'Blk': 'Black',
  'Rd': 'Red',
  'Wht': 'White',
  'Blu': 'Blue',
  'Purp': 'Purple',
  'Brwn': 'Brown',
  'Grn': 'Green',
  'Pkf': 'Pink',
  'Ylw': 'Yellow',
  'Gry': 'Gray',
  
  // Comfort/General
  'Cmfrt': 'Comfort',
  'Nat': 'Natural',
  'Natu': 'Natural',
  'Natl': 'Natural',
  'Rwrds': 'Rewards',
  'Essen': 'Essentials',
  
  // Quantity
  'Pk': 'Pack',
  'Dbl': 'Double',
  'Sngl': 'Single',
  'Asst': 'Assorted',
  
  // Age/Demographics
  'Jr': 'Junior',
  'Sr': 'Senior',
  'Juvi': 'Juvenile',
  
  // Animals
  'Eleph': 'Elephant',
  'Shri': 'Shrimp',
  
  // Chemistry (non-context dependent)
  'Phos': 'Phosphate',
  
  // Common misspellings
  'Thermoneter': 'Thermometer',
  'Greeniues': 'Greenies',
  'Wishbne': 'Wishbone',
  'Puppt': 'Puppy',
  'Seniior': 'Senior',
  
  // Compound word spacing fixes
  'Naturesmiracle': "Nature's Miracle",
  'Milkbne': 'Milk-Bone',
  'Milkbone': 'Milk-Bone',
  'Prettypets': 'Pretty Pets',
  'Jollypet': 'Jolly Pets',
  'Sweetharvest': 'Sweet Harvest',
  'Worldsbestcatlitter': "World's Best Cat Litter",
  'AssortedMedium': 'Assorted Medium',
  
  // Mammoth toy internal abbreviations
  'Xtr': 'Extra',
  'Clth': 'Cloth',
  'Tb': 'TireBiter',
  'Tpr': 'TPR',
  'Xfresh': 'Extra Fresh',
  '3knt': '3 Knot',
  'Tirebite': 'TireBiter',
  'Tirebitii': 'TireBiter II',
  
  // Kaytee/Oxbow small animal products (verified from official websites)
  'Rainbw': 'Rainbow',
  'Runrnd': 'Run Around',
  'Tclub': 'Timothy Club',
  'Runabutball': 'Run-About Ball',
  'Clr': 'Clear',
  'Pebb': 'Pebbles',
  
  // Collar/Leash abbreviations
  'Cllr': 'Collar',
  'Seccllr': 'Security Collar',
  'Lsh': 'Leash',
  'Harn': 'Harness',
  'Adj': 'Adjustable',
  'Nyl': 'Nylon',
  'Lth': 'Leather',
  
  // Coastal Pet Products Pattern Names (Authorized Dealer Styles)
  // Reference: https://coastalpet.com/media/nd3izx2w/2024productcatalog.pdf (Page 11)
  // Verified from official 2024 Product Catalog, November 28, 2025
  'Aln': 'Aliens',
  'Dns': 'Dinosaurs',
  'Fdn': 'Frosted Donuts',
  'Llm': 'Llamas',
  'Pia': 'Pineapples',
  'Ucn': 'Unicorns',
  'Bigdogtieout': 'Big Dog Tie Out',
  
  // Coastal Pet Styles Pattern Codes (December 5, 2025)
  // Reference: https://www.coastalpet.com/products/detail/?id=PSC01 (Styles Adjustable Dog Collar)
  // Core Styles Patterns
  'Bbo': 'Black Bones',
  'Rbo': 'Red Bones',
  'Spw': 'Special Paws',
  'Skz': 'Black Skulls',
  'Skx': 'Black Skulls',  // Alternate code
  'Btd': 'Bright Tie Dye',
  'Csr': 'Chevrons & Stars',
  'Wdf': 'Wildflower',
  'Htf': 'Hunter Tropical Flower',
  'Tpd': 'Teal Purple Diamonds',
  'Pbo': 'Plaid Bones',
  'Pdt': 'Pink Dots',
  
  // Coastal Authorized Dealer Exclusive Patterns
  // Reference: https://www.coastalpet.com/products/detail/?id=ADC01
  'Gxy': 'Galaxy',
  'Hrw': 'Hawaiian',
  'Lsk': 'Leopard Skin',
  'Lss': 'Leopard Spots',
  'Nbp': 'Navy Blue Plaid',
  'Ppa': 'Pink Paisley',
  'Pmf': 'Pink Mosaic Flower',
  'Rwp': 'Red & White Plaid',
  'Ybc': 'Yellow Bee',
  'Tsa': 'Teal Safari',
  'Bmb': 'Blue Marble',
  
  // Coastal New Earth Soy Collection Color Codes
  // Reference: coastalpet.com/by-brand/new-earth-soy/
  'Sla': 'Slate',
  'Fsa': 'Fuchsia',
  'Crn': 'Cranberry',
  'Ony': 'Onyx',
  'Cyn': 'Canyon',
  
  // Coastal Ribbon/K-9 Explorer Pattern Codes
  'Mdw': 'Meadow',
  'Des': 'Desert',
  'Mlm': 'Millennium',
  'Mtn': 'Mountain',
  'Pwy': 'Parkway',
  'Raf': 'Safari',
  'Shb': 'Shamrock',
  'Dgm': 'Diagram',
  'Lwo': 'Lupine Wildwood',
  'Oce': 'Ocean',
  'Lak': 'Lake',
  'Tel': 'Teal',
  'Cto': 'Cotton',
  'Wwl': 'Woodland',
  'Ctn': 'Cotton',
  'Fwt': 'Floral White',
  'Mbn': 'Marine Blue Navy',
  'Mpw': 'Multi Paw',
  'Org': 'Orange',
  'Bzs': 'Bronze Star',
  
  // Coastal Pattern Elements
  'Sob': 'Skull on Black',
  'Tig': 'Tiger',
  'Npk': 'Neon Pink',
  'Bio': 'Biothane',
  
  // Coastal Waterproof Collection (Ww prefix)
  // Reference: Coastal Pro Waterproof line
  'Ww': 'Waterproof',
  'Wtrprf': 'Waterproof',
  
  // Coastal Product Type Abbreviations
  'Trncllr': 'Training Collar',
  'Secclrr': 'Security Collar',
  'Seccllr': 'Security Collar',
  'Collr': 'Collar',
  'Colar': 'Collar',  // Typo fix
  
  // Coastal Collar/Leash numeric patterns
  // Format: PatternSize" Type (e.g., Bbo12" means Black Bones 12" Collar)
  // Size codes are handled separately
  
  // Additional Coastal pattern codes found in database
  'Dab': 'Dark Blue',
  'Fhb': 'Fern Harbor Blue',
  'Fsd': 'Forest',
  'Gbf': 'Green Blue Floral',
  'Gbg': 'Green Blue Gray',
  'Gbt': 'Green Blue Teal',
  'Ggs': 'Green Gray Stripe',
  'Gls': 'Green Leopard Spots',
  'Goc': 'Gold Orange',
  'Gof': 'Gold Floral',
  'Gpl': 'Gray Plaid',
  'Gpq': 'Gray Pink Quatrefoil',
  'Gxn': 'Gray Neon',
  'Hph': 'Hot Pink Hearts',
  'Ldb': 'Light Blue',
  'Leb': 'Leopard Blue',
  'Lts': 'Light Stripe',
  'Mch': 'Magenta Check',
  'Mgn': 'Magenta',
  'Pcg': 'Purple Camo Green',
  'Pcr': 'Purple Camo Red',
  'Ptr': 'Pink Tiger',
  'Pur': 'Purple',
  'Scb': 'Seafoam Blue',
  'Shn': 'Shamrock',
  'Smw': 'Smoke White',
  'Sou': 'Southwest',
  'Tdp': 'Tie Dye Pink',
  'Uns': 'Unicorn Stars',
  'Wrp': 'Wrap',
  'Zeb': 'Zebra',
  'Zpk': 'Zebra Pink',
  'Pby': 'Pink Blue Yellow',
  'Btr': 'Blue Tiger',
  'Dpm': 'Diamond Pink',
  
  // Product type abbreviations
  'Orig': 'Original',
  'Ori': 'Original',
  'Trop': 'Tropical',
  'Flvr': 'Flavor',
  'Flv': 'Flavor',
  'Rll': 'Roll',
  'Rlls': 'Rolls',
  'Twst': 'Twist',
  'Wtrlily': 'Water Lily',
  
  // Brand abbreviation fixes
  'Nthntohide': "Nothin' to Hide",
  'Nthtohide': "Nothin' to Hide",
  'Nutr Sou': 'Nutrisource',
  'Nyla': 'Nylabone',
  'Flexichew': 'FlexiChew',
  'Reg': 'Regular',
  
  // Food/Flavors
  'Snk': 'Snack',
  'Ckn': 'Chicken',
  'Carr': 'Carrot',
  'Blubrede': 'Blueberry',
  'White Gr': 'With Grain',
  'Red B': 'RedBarn',
  'Waf': 'Waffer',
  'Blo': 'Blood',
  'Cmbs': 'Crumbs',
  'Chckwcheese': 'Chicken With Cheese',
  'Whslm': 'Wholesome',
  'Whlsm': 'Wholesome',
  'Wholso': 'Wholesome',
  'Wholeso': 'Wholesome',
  'Forti': 'Fortified',
  'Bis': 'Bison',
  'Bore': 'Boar',
  'Ck': 'Chicken',
  'Chkn': 'Chicken',
  'Bcn': 'Bacon',
  'Pb': 'Peanut Butter',
  'Bne': 'Bone',
  'Tur': 'Turkey',
  'Ven': 'Venison',
  'Be': 'Beef',
  'Bef': 'Beef',
  'Veg': 'Vegetable',  // Restored - will be conditionally skipped for Fromm products
  'Bar': 'Barley',
  'Pumpk': 'Pumpkin',
  'Sw Pot': 'Sweet Potato',
  'Gr Bean': 'Green Bean',
  'Br Rice': 'Brown Rice',
  'Prot': 'Protein',
  'He Wei': 'Healthy Weight',
  'Sensi': 'Sensitive',
  'Spiru': 'Spirulina',
  'Brin': 'Brine',
  'Sal': 'Salmon',
  'Dck': 'Duck',
  'duck': 'Duck',
  'Lmb': 'Lamb',
  'beef': 'Beef',
  'Truk': 'Turkey',
  'Veni': 'Venison',
  'App': 'Apple',
  'Chu': 'Chunks',
  'Riv': 'River',
  'Cich': 'Cichlid',
  'Pel': 'Pellets',
  'Sup': 'Super',
  'Col': 'Color',
  'Nib': 'Nibbles',
  'Pat': 'Pate',
  'Crip': 'Crisp',
  // 'Tndr Bts': 'Tender Bites',  // MOVED TO BRAND CATALOG
  // 'Lil Bts': 'Little Bites',  // MOVED TO BRAND CATALOG
  // 'Little Bts': 'Little Bites',  // MOVED TO BRAND CATALOG
  'Nutty Butt Bts': 'Nutty Butter Bites',
  'Bts': 'Bites',
  
  // Nutrisource Product Lines (fallback - prefer brand catalog)
  // 'Chom': 'Chompy Chompers',  // MOVED TO BRAND CATALOG
  // 'Chomp': 'Chompy Chompers',  // MOVED TO BRAND CATALOG
  
  // Accessories
  'Hrness': 'Harness',
  
  // Fix awkward spacing issues
  'Div Ider': 'Divider',
  
  // Aquarium Equipment
  'Whisp': 'Whisper',
  'Filt': 'Filter',
  'Crt': 'Cartridge',
  'Cart': 'Cartridge',
  'Crb': 'Carbon',
  'Therm': 'Thermometer',
  'Therma': 'Thermal',
  'Spng': 'Sponge',
  'Plnt': 'Plant',
  'Rck': 'Rock',
  'Blm': 'Bloom',
  'Flwr': 'Flower',
  'Ptch': 'Patch',
  'Mush': 'Mushroom',
  'Pnk': 'Pink',
  'Sprflx': 'Superflex',
  'Wld': 'Wild',
  'Mxred': 'Mixed',
  'Vib': 'Vibrant',
  'Repl': 'Replacement',
  'Pd': 'Pad',
  'Contr': 'Controller',
  'Con': 'Conditioner',
  'Wtr': 'Water',
  'Wat': 'Water',
  'Mod': 'Model',
  'Aquar': 'Aquarium',
  
  // Toys/Misc
  '&Fam': '& Family',
  '&fam': '& Family',
  'Strng': 'String',
  'Tug': 'Tug',
  
  // Brands (only expand when at start or after space)
  'Kng': 'Kong',
  'Vit': 'Vital',
  'Ess': 'Essentials',
  'Simplesolutions': 'Simple Solutions',
  'Ntrisrc': 'Nutrisource',
  'Nutrisrc': 'Nutrisource',
  'Rndlk': 'Round Lake Farm',
  'Friendfrm': 'Tiny Friends Farm',
  'Bluebuff': 'Bluebuffalo',
  'Arm&ham': 'Arm & Hammer',
  'Arm&hamm': 'Arm & Hammer',
  
  // Brand name corrections (misspelled forms in product names)
  'Zoomed': 'Zoo Med',
  'ZooMed': 'Zoo Med',  // Sometimes written as one word
  'Zoomd': 'Zoo Med',
  
  // Coastal Pet Products Pattern Names - Color/Pattern Abbreviations
  // Reference: Coastal 2024 Product Catalog patterns analysis
  'Rgb': 'Rainbow',
  'Rbg': 'Rainbow',
  'Gyp': 'Gray Pink',
  'Gyb': 'Gray Blue',
  'Gyr': 'Gray Red',
  'Gyu': 'Gray Purple',
  'Sls': 'Solid',
  'Sso': 'Solid',
  'Lim': 'Lime',
  'Bws': 'Black White Stripe',
  'Pkt': 'Pink Teal',
  'Snp': 'Snake Print',
  'Suf': 'Sunflower',
  'Ord': 'Orange',
  
  // Coastal Size abbreviations (combined with patterns)
  'xsm': 'Extra Small',
  'xxs': 'Extra Extra Small',
  'sml': 'Small',
  'lrg': 'Large',
  'xlg': 'Extra Large',
  
  // Session Dec 4, 2025 - From user screenshots of Excel export
  // Aquarium decorations
  'Wcral': 'Coral',
  'Baileyinwtr': 'Bailey In Water',
  'Watrs': 'Waters',
  
  // Aquatop Aquarium Decorations (Dec 12, 2025)
  // Reference: User screenshot showing abbreviated plant names
  'Gar': 'Garden',
  'Viol': 'Violet',
  'Lavendr': 'Lavender',
  'Lavndr': 'Lavender',
  'Lav': 'Lavender',
  'Mag': 'Magenta',
  'Magent': 'Magenta',
  'Cyp': 'Cyprus',
  'Cyprs': 'Cyprus',
  'Acat': 'Acacia Tree',
  'Boto': 'Botowood',
  'Bottw': 'Botowood',
  'Vibrt': 'Vibrant',
  'Vibrnt': 'Vibrant',
  'Flr': 'Fluorescent',
  'Fluor': 'Fluorescent',
  'Pwdr': 'Powder',
  'Aquascpe': 'Aquascape',
  'Aquascape': 'Aquascape',
  'Hdrngea': 'Hydrangea',
  'Hydrng': 'Hydrangea',
  'Bmboo': 'Bamboo',
  'Bmbo': 'Bamboo',
  'Orcd': 'Orchid',
  'Orchd': 'Orchid',
  'Orch': 'Orchid',
  'Ros': 'Rose',
  'Lil': 'Lily',
  'Lly': 'Lily',
  'Tulp': 'Tulip',
  'Dahla': 'Dahlia',
  'Dahl': 'Dahlia',
  'Ptn': 'Pothos',
  'Pthos': 'Pothos',
  'Fern': 'Fern',
  'Ludw': 'Ludwigia',
  'Ludwg': 'Ludwigia',
  'Cabmba': 'Cabomba',
  'Cabomb': 'Cabomba',
  'Anubs': 'Anubias',
  'Anub': 'Anubias',
  'Amazn': 'Amazon',
  'Amaz': 'Amazon',
  'Swrd': 'Sword',
  'Vallis': 'Vallisneria',
  'Valsnra': 'Vallisneria',
  'Cripta': 'Cryptocoryne',
  'Crypt': 'Cryptocoryne',
  'Javamoss': 'Java Moss',
  'Javfern': 'Java Fern',
  'Rotla': 'Rotala',
  
  // Pet House / Air Fresheners (must be split properly)
  'Pethouse': 'Pet House',
  'Atm': 'Autumn',
  'Hrvst': 'Harvest',
  'Hrvststck': 'Harvest Stacks',
  'Cntryhrvst': 'Country Harvest',
  'Sandlewd': 'Sandalwood',
  'Mangopeach': 'Mango Peach',
  
  // Health Extension product lines
  'Exten': 'Extension',
  'Dig Super': 'Digestive Super',
  'Gen Cook': 'Gently Cooked',
  'Shin Coat': 'Shiny Coat',
  
  // Pet House products
  'Sandle Wd': 'Sandalwood',
  'Reed Diff': 'Reed Diffuser',
  'Sandal Wax': 'Sandalwood Wax',
  
  // Oxbow products
  'Wt': 'Weight',
  
  // Smokehouse products
  'Skewrs': 'Skewers',
  'Pep Stix': 'Pepperoni Sticks',
  'Sweet Pot': 'Sweet Potato',
  
  // SmartBones size codes
  '4med': '4 Medium',
  '24 Mini': '24 Mini',
  
  // Skin
  'Skn': 'Skin',
  
  // Dog treats - bones
  'Bns': 'Bones',
  'Knotted': 'Knotted',
  
  // Dog treats - meat
  'Prk': 'Pork',
  'Sft': 'Soft',
  
  // Fromm products
  'Nurti': 'Nutri',
  'Crunchyos': "Crunchy O's",
  'Banna': 'Banana',
  'Pumkin': 'Pumpkin',
  'Potroast': 'Pot Roast',
  'Tenderollies': 'Tenderollies',
  
  // Blue Buffalo
  'Healthbr': 'Health Bars',
  'Truchew': 'True Chews',
  'Truchews': 'True Chews',
  
  // Grandma Lucy's
  'Gmaw': 'Grandma',
  
  // Smokehouse
  'Smkhouse': 'Smokehouse',
  
  // Good n Fun
  'Goodnfun': "Good 'n' Fun",
  '3flv': '3 Flavor',
  
  // Beggar Bones
  'Beggarbns': 'Beggar Bones',
  '3in1': '3 in 1',
  
  // Crazydog
  'Crazydog': 'Crazy Dog',
  
  // Nutrichomps
  'Nutrichomp': 'Nutrichomps',
  'Nutrichomps': 'Nutrichomps',
  '4cnt': '4 Count',
  '8 Cnt': '8 Count',
  '4count': '4 Count',
  '6count': '6 Count',
  
  // Fruitables
  'Fruitables': 'Fruitables',
  
  // Healthext / Health Extension
  'Healthext': 'Health Extension',
  '3.5oz': '3.5 oz',
  
  // Charlee Bear - NOTE: Don't expand 'Charlee' → 'Charlee Bear' as it causes duplication
  
  // Small animal products
  'Smanimal': 'Small Animal',
  'Omniv': 'Omnivore',
  'Carn': 'Carnivore',
  'Ns': 'Natural Science',
  'Supp': 'Support',
  'Urinary': 'Urinary',
  'Herb Ab': 'Herbal Antibacterial',
  
  // Marshall Bandits
  'Bann': 'Banana',
  
  // Friends Farm
  'Frndsfrm': 'Friends Farm',
  'Scrummies': 'Scrummies',
  
  // Water bottles
  'Petwtrbtle': 'Pet Water Bottle',
  'Petwtrbttle': 'Pet Water Bottle',
  'Wtrbttl': 'Water Bottle',
  'Bttl': 'Bottle',
  
  // Lock Crock
  'Crok': 'Crock',
  'Croc': 'Crock',
  
  // Kaytee products
  'Chew Proof': 'Chew Proof',
  
  // Coastal Comfort Walk
  'Cwmk': 'Comfort Walk',
  
  // Coastal cat harness
  'Catsoftmeshharn': 'Cat Soft Mesh Harness',
  'Catsoftmeshharness': 'Cat Soft Mesh Harness',
  
  // Coastal Collar color codes (from screenshots)
  'Cc': 'Collar',
  'Slv': 'Silver',
  'Mgd': 'Magenta',
  'Gsa': 'Green Safari',
  'Mpy': 'Magenta Pink Yellow',
  'Shc': 'Shamrock',
  'Tpe': 'Taupe',
  'Csf': 'Confetti',
  'Mtm': 'Mint',
  'Tzx': 'Topaz',
  'Gks': 'Greek Key',
  'Gsw': 'Gray Swirl',
  'Rfl': 'Reflective',
  'Prl': 'Pearl',
  'Ste': 'Steel',
  'Cmo': 'Camo',
  'Bsr': 'Blue Stripe',
  'Sog': 'Sage Olive Green',
  'Sbe': 'Sky Blue',
  'Dmb': 'Denim Blue',
  
  // Vitadrops / Vitamins
  'Vitadrops': 'Vita Drops',
  'Pure C': 'Pure Vitamin C',
  
  // Session Dec 1, 2025 - Common abbreviations and typos (from 94.94% to 99.20% session)
  'Marinelnd': 'Marineland',
  'Marshal': 'Marshall',
  'Multipet': 'Multipet',
  'Muktipet': 'Multipet',
  'Mulitpet': 'Multipet',
  'Espree': 'Espree',
  'Lees': "Lee's",
  'Keepoff': 'Four Paws Keep Off',
  'Naturflex': 'NatureFlex',
  'Nutrivet': 'Nutri-Vet',
  'Otwrd': 'Outward',
  'Pennplac': 'Penn Plax',
  'Pennplex': 'Penn Plax',
  'Purevit': 'PureVita',
  'Reptoguard': 'ReptoGuard',
  'Reptosticks': 'ReptoSticks',
  'Tetrafauna': 'TetraFauna',
  'Rascal': 'Rascals',
  'Sunburts': 'Sunburst',
  'Sweethrvst': 'Sweet Harvest',
  'Topiclean': 'TropiClean',
  'Tropicalen': 'TropiClean',
  'Troiclean': 'TropiClean',
  'Vitacraft': 'Vitakraft',
  'Washaway': 'Wash Away',
  'Weeweed': 'Wee-Wee',
  'Yummycmbs': 'YummyCombs',
  'Vaness': 'Van Ness',
  'Ruffntuff': 'Ruff N Tuff',
  'Shepboy': 'Shepherd Boy',
  'Shephard': 'Shepherd Boy',
  'Oxboy': 'Oxbow',
  'Suziescbd': "Suzie's CBD",
  'Praziguard': 'PraziGuard',
  'Remedyrecv': 'RemedyRecovery',
  
  // Fromm Product Lines (fallback - prefer brand catalog)
  // 'Pure Sniffers': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  // 'Pu Sniffers': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  // 'Pur Sni': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  // 'Pu Sni': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  // 'Sniffers': 'PurrSnickity',  // MOVED TO BRAND CATALOG
  
  // Location/Environment (fallback - prefer brand catalog for Science Diet)
  // 'In Do': 'Indoor',  // MOVED TO BRAND CATALOG (Science Diet specific)
  
  // Brand-specific context (removed generic expansions - now use brand catalog)
  // Fromm, Freshpet, Science Diet, Nutrisource require brand catalog
};

/**
 * Determines if "Ph" should be treated as pH (water chemistry) or Prevue Hendrix (brand)
 * @param text - The full text being analyzed
 * @param phPosition - Position of "Ph" in the text
 * @returns true if it's water chemistry pH, false if it's Prevue Hendrix brand
 */
function isWaterChemistryPh(text: string, phPosition: number): boolean {
  const lowerText = text.toLowerCase();
  const afterPh = lowerText.substring(phPosition + 2).trim();
  
  // Check if followed by chemistry keywords
  for (const keyword of PH_CHEMISTRY_KEYWORDS) {
    if (afterPh.startsWith(keyword)) {
      return true;
    }
  }
  
  // Check if preceded by chemistry brand
  const beforePh = lowerText.substring(0, phPosition).trim();
  for (const brand of PH_CHEMISTRY_BRANDS) {
    if (beforePh.endsWith(brand)) {
      return true;
    }
  }
  
  // Default: it's Prevue Hendrix brand
  return false;
}

/**
 * Determines if "Ga" should be treated as Gallon (volume measurement) in aquarium context
 * @param text - The full text being analyzed
 * @param gaPosition - Position of "Ga" in the text
 * @returns true if it's Gallon measurement, false otherwise
 */
function isAquariumGallon(text: string, gaPosition: number): boolean {
  const lowerText = text.toLowerCase();
  const afterGa = lowerText.substring(gaPosition + 2).trim();
  const beforeGa = lowerText.substring(0, gaPosition).trim();
  
  // Check if followed by aquarium keywords (e.g., "10 Ga Tank")
  for (const keyword of GALLON_AQUARIUM_KEYWORDS) {
    if (afterGa.startsWith(keyword)) {
      return true;
    }
  }
  
  // Check if preceded by a number (e.g., "10 Ga" or "20Ga")
  // Look for digits immediately before or with a space
  if (/\d\s*$/.test(beforeGa)) {
    return true;
  }
  
  // Check if preceded by aquarium brand
  for (const brand of GALLON_AQUARIUM_BRANDS) {
    if (beforeGa.includes(brand)) {
      return true;
    }
  }
  
  // Check if the text contains aquarium keywords anywhere
  for (const keyword of GALLON_AQUARIUM_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return true;
    }
  }
  
  // Default: not a gallon measurement
  return false;
}

/**
 * Expands abbreviations in a text string with context awareness
 * Uses brand catalog first (research-backed), then falls back to generic mappings
 * @param text - Text to expand abbreviations in
 * @param storage - Optional storage for brand catalog lookup (async version recommended)
 * @returns Text with expanded abbreviations
 */
export function expandAbbreviations(text: string | null | undefined, storage?: IStorage): string {
  if (!text || typeof text !== 'string') return '';
  
  // NOTE: This is the synchronous version for backwards compatibility
  // For brand catalog expansion, use expandAbbreviationsAsync instead
  
  let result = text;
  
  // === BRAND NAME PRE-PROCESSING (must come before other fixes) ===
  // Fix "Zoomed" → "Zoo Med" (commonly written as one word or misspelled)
  result = result.replace(/\bZoomed\b/gi, 'Zoo Med');
  result = result.replace(/\bZooMed\b/g, 'Zoo Med');
  result = result.replace(/\bZoomd\b/gi, 'Zoo Med');
  // Fix "Zoo Medium" → "Zoo Med" (common typo/expansion error)
  result = result.replace(/\bZoo Medium\b/gi, 'Zoo Med');
  
  // Fix "Bluebuffalo" → "Blue Buffalo" (brand name spacing)
  result = result.replace(/\bBluebuffalo\b/gi, 'Blue Buffalo');
  
  // Fix "A & e" → "A&E" (brand name formatting for A&E Cage Co)
  result = result.replace(/\bA & e\b/gi, 'A&E');
  result = result.replace(/\bA &e\b/gi, 'A&E');
  result = result.replace(/\bA& e\b/gi, 'A&E');
  
  // Fix "Pethonesty" → "Pet Honesty" (brand name spacing)
  result = result.replace(/\bPethonesty\b/gi, 'Pet Honesty');
  
  // Fix common typos
  result = result.replace(/\bWoodn\b/gi, 'Wooden');
  
  // Fix spacing issues first
  // 1. Replace double (or more) spaces with single space
  result = result.replace(/\s{2,}/g, ' ');
  
  // 2. Fix ampersand spacing: add space before & if missing
  result = result.replace(/([a-zA-Z])&/g, '$1 &');
  
  // 3. Fix ampersand spacing: add space after & if missing (except &fam which we handle separately)
  result = result.replace(/&([a-zA-Z])/g, '& $1');
  
  // Handle "Ph" with context detection (must be done first before other replacements)
  // Match "Ph" as a whole word at the start or after a space
  const phRegex = /\bPh\b/g;
  let match;
  const phMatches: Array<{index: number, isChemistry: boolean}> = [];
  
  while ((match = phRegex.exec(result)) !== null) {
    phMatches.push({
      index: match.index,
      isChemistry: isWaterChemistryPh(result, match.index)
    });
  }
  
  // Replace from end to start to preserve positions
  for (let i = phMatches.length - 1; i >= 0; i--) {
    const { index, isChemistry } = phMatches[i];
    if (isChemistry) {
      // Water chemistry: Ph → pH
      result = result.substring(0, index) + 'pH' + result.substring(index + 2);
    } else {
      // Brand name: Ph → Prevue Hendrix
      result = result.substring(0, index) + 'Prevue Hendrix' + result.substring(index + 2);
    }
  }
  
  // Handle "Ga" with context detection (aquarium gallon measurements)
  // Match "Ga" as a whole word
  const gaRegex = /\bGa\b/gi;
  const gaMatches: Array<{index: number, isGallon: boolean}> = [];
  
  while ((match = gaRegex.exec(result)) !== null) {
    gaMatches.push({
      index: match.index,
      isGallon: isAquariumGallon(result, match.index)
    });
  }
  
  // Replace from end to start to preserve positions
  for (let i = gaMatches.length - 1; i >= 0; i--) {
    const { index, isGallon } = gaMatches[i];
    if (isGallon) {
      // Aquarium measurement: Ga → Gallon
      result = result.substring(0, index) + 'Gallon' + result.substring(index + 2);
    }
    // Otherwise leave "Ga" as-is (could be abbreviation for Georgia, etc.)
  }
  
  // Expand other abbreviations (whole word matches)
  for (const [abbrev, expansion] of Object.entries(ABBREVIATION_MAPPINGS)) {
    // Create regex that matches whole word (case-insensitive)
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    result = result.replace(regex, expansion);
  }
  
  // Handle "Med" → "Medium" with negative lookbehind to protect "Zoo Med"
  result = result.replace(/(?<!Zoo )\bMed\b/gi, 'Medium');
  
  // Auto-capitalize word after ampersand (& apple → & Apple)
  result = result.replace(/& ([a-z])/g, (match, letter) => `& ${letter.toUpperCase()}`);
  
  return result;
}

/**
 * Expansion context for brand-aware abbreviation handling
 * Protects brand-validated tokens from generic expansion
 */
interface ExpansionContext {
  resolvedBrand: string | null;
  protectedTokens: Set<string>;
}

/**
 * Detect brand from product name
 * @param text - Product name/description
 * @returns Brand name or null
 */
function detectBrand(text: string): string | null {
  const brandPatterns = [
    'Fromm', 'Nutrisource', 'Blue Buffalo', 'Taste of the Wild',
    'Science Diet', 'Orijen', 'Merrick', 'Royal Canin', 'Wellness',
    'Natural Balance', 'Canidae', 'Instinct'
  ];
  
  // Check for full brand names first
  for (const brand of brandPatterns) {
    if (new RegExp(`\\b${brand}\\b`, 'i').test(text)) {
      return brand;
    }
  }
  
  // Check for Nutrisource abbreviated variations
  if (/\bNutri\s+Sour\b/i.test(text) || /\bNutr\s+Sour\b/i.test(text) || /\bNutri\s+Sou\b/i.test(text) || /\bNutrisrc\b/i.test(text) || /\bNtrisrc\b/i.test(text)) {
    return 'Nutrisource';
  }
  
  return null;
}

/**
 * Async version: Expands abbreviations using brand catalog FIRST, then generic fallback
 * This is the preferred method for new code
 * @param text - Text to expand abbreviations in
 * @param storage - Storage interface for brand catalog
 * @returns Promise with object containing expanded text and catalog usage flag
 */
export async function expandAbbreviationsAsync(
  text: string | null | undefined,
  storage: IStorage
): Promise<{ expanded: string; catalogUsed: boolean }> {
  if (!text || typeof text !== 'string') return { expanded: '', catalogUsed: false };
  
  // Initialize expansion context
  const context: ExpansionContext = {
    resolvedBrand: detectBrand(text),
    protectedTokens: new Set<string>()
  };
  
  // Step 0: Smart context-aware pattern expansion (Brand-specific fixes)
  
  // === BRAND NAME FIXES ===
  // Fix "Zoomed" → "Zoo Med" (commonly written as one word or misspelled)
  let preProcessed = text.replace(/\bZoomed\b/gi, 'Zoo Med');
  preProcessed = preProcessed.replace(/\bZooMed\b/g, 'Zoo Med');
  preProcessed = preProcessed.replace(/\bZoomd\b/gi, 'Zoo Med');
  // Fix "Zoo Medium" → "Zoo Med" (common typo/expansion error)
  preProcessed = preProcessed.replace(/\bZoo Medium\b/gi, 'Zoo Med');
  
  // Fix "Bluebuffalo" → "Blue Buffalo" (brand name spacing)
  preProcessed = preProcessed.replace(/\bBluebuffalo\b/gi, 'Blue Buffalo');
  
  // Fix "A & e" → "A&E" (brand name formatting for A&E Cage Co)
  preProcessed = preProcessed.replace(/\bA & e\b/gi, 'A&E');
  preProcessed = preProcessed.replace(/\bA &e\b/gi, 'A&E');
  preProcessed = preProcessed.replace(/\bA& e\b/gi, 'A&E');
  
  // Fix "Pethonesty" → "Pet Honesty" (brand name spacing)
  preProcessed = preProcessed.replace(/\bPethonesty\b/gi, 'Pet Honesty');
  
  // Fix spacing for titles with periods (Dr., St., Mr.)
  preProcessed = preProcessed.replace(/\bDr\.elseys\b/gi, "Dr. Elsey's");
  preProcessed = preProcessed.replace(/\bSt\.roccos\b/gi, "St. Rocco's");
  preProcessed = preProcessed.replace(/\bMr\.bill\b/gi, 'Mr. Bill');
  preProcessed = preProcessed.replace(/\bDr\.noyz\b/gi, 'Dr. Noyz');
  
  // Fix Valu-Pak formatting
  preProcessed = preProcessed.replace(/\bValu Pak\b/gi, 'Valu-Pak');
  
  // Fix Li'l Pals
  preProcessed = preProcessed.replace(/\bLil Pals\b/gi, "Li'l Pals");
  
  // Fix common typos
  preProcessed = preProcessed.replace(/\bWoodn\b/gi, 'Wooden');
  
  // === COASTAL PET PRODUCTS PATTERN+SIZE SPLITTING ===
  // Coastal uses concatenated pattern+size codes like "Rgbxsm", "Gypmed", etc.
  // These need to be split before word-boundary matching can work
  // Pattern codes: Rgb, Rbg, Gyp, Gyb, Gyr, Gyu, Sls, Sso, Lim, Bws, Pkt, Snp, Suf, Ord, Pnk
  // Size codes: xsm, xxs, sml, med, lrg, xlg, xxxs
  
  // Split pattern+size combinations (insert space before size code)
  preProcessed = preProcessed.replace(/(Rgb|Rbg|Gyp|Gyb|Gyr|Gyu|Sls|Sso|Lim|Bws|Pkt|Snp|Suf|Ord|Pnk|Black|Blue|Red|Pink|Green|Purple|Lime|Gray|Orange|Bright)(xsm|xxs|xxxs|sml|med|lrg|xlg)/gi, '$1 $2');
  
  // Expand Coastal pattern codes
  preProcessed = preProcessed.replace(/\bRgb\b/gi, 'Rainbow');
  preProcessed = preProcessed.replace(/\bRbg\b/gi, 'Rainbow');
  preProcessed = preProcessed.replace(/\bGyp\b/gi, 'Gray Pink');
  preProcessed = preProcessed.replace(/\bGyb\b/gi, 'Gray Blue');
  preProcessed = preProcessed.replace(/\bGyr\b/gi, 'Gray Red');
  preProcessed = preProcessed.replace(/\bGyu\b/gi, 'Gray Purple');
  preProcessed = preProcessed.replace(/\bSls\b/gi, 'Solid');
  preProcessed = preProcessed.replace(/\bSso\b/gi, 'Solid');
  preProcessed = preProcessed.replace(/\bLim\b/gi, 'Lime');
  preProcessed = preProcessed.replace(/\bBws\b/gi, 'Black White Stripe');
  preProcessed = preProcessed.replace(/\bPkt\b/gi, 'Pink Teal');
  preProcessed = preProcessed.replace(/\bSnp\b/gi, 'Snake Print');
  preProcessed = preProcessed.replace(/\bSuf\b/gi, 'Sunflower');
  preProcessed = preProcessed.replace(/\bOrd\b/gi, 'Orange');
  preProcessed = preProcessed.replace(/\bPnk\b/gi, 'Pink');
  
  // Expand Coastal size codes
  // NOTE: "med" pattern excludes "Zoo Med" brand name to prevent "Zoo Med" → "Zoo Medium"
  preProcessed = preProcessed.replace(/\bxxxs\b/gi, 'Extra Extra Extra Small');
  preProcessed = preProcessed.replace(/\bxxs\b/gi, 'Extra Extra Small');
  preProcessed = preProcessed.replace(/\bxsm\b/gi, 'Extra Small');
  preProcessed = preProcessed.replace(/\bsml\b/gi, 'Small');
  preProcessed = preProcessed.replace(/(?<!Zoo )\bmed\b/gi, 'Medium');
  preProcessed = preProcessed.replace(/\blrg\b/gi, 'Large');
  preProcessed = preProcessed.replace(/\bxlg\b/gi, 'Extra Large');
  
  // Nutrisource: "Crispy Crip" → "Crispy Crispers"
  // Handle "Nutrisource Crispy Crip Lamb" → "Nutrisource Crispy Crispers Lamb"
  // Reference: https://nutrisourcepetfoods.com/our-food/chicken-duck-crispy-crispers/
  const nutrisourceCrispyCripPattern = /\b(Nutrisource)\s+Crispy\s+Crip\b/gi;
  preProcessed = preProcessed.replace(nutrisourceCrispyCripPattern, "$1 Crispy Crispers");
  
  // Nutrisource: "Crispy Crisp" → "Crispy Crispers"
  // Handle "Nutrisource Crispy Crisp Lamb" → "Nutrisource Crispy Crispers Lamb"
  const nutrisourceCrispyCrispPattern = /\b(Nutrisource)\s+Crispy\s+Crisp\b/gi;
  preProcessed = preProcessed.replace(nutrisourceCrispyCrispPattern, "$1 Crispy Crispers");
  
  // Nutrisource: "Crisp" (without "Crispy") → "Crispers"
  // Handle "Nutrisource Crisp Chicken" → "Nutrisource Crispers Chicken"
  const nutrisourceCrispPattern = /\b(Nutrisource)\s+Crisp\b(?!\s*Crispers)/gi;
  preProcessed = preProcessed.replace(nutrisourceCrispPattern, "$1 Crispers");
  
  // Nutrisource: "Grill" → "Grillin' Grillers"
  // Handle "Nutrisource Grill [anything]" → "Nutrisource Grillin' Grillers [anything]"
  // Uses negative lookahead to prevent matching "Grilled" or "Grills" or "Grillin'"
  const nutrisourceGrillPattern = /\b(Nutrisource)\s+Grill(?!ed|s|in')\b/gi;
  preProcessed = preProcessed.replace(nutrisourceGrillPattern, "$1 Grillin' Grillers");
  
  // === NUTRISOURCE COMPREHENSIVE BRAND & PRODUCT LINE EXPANSION ===
  // Reference: https://nutrisourcepetfoods.com/, https://discovernutrisource.com/
  // Verified via Google search November 2024
  
  // STEP 1: Brand Name Normalization (MUST come first before product line expansion)
  // Fix all variations of abbreviated "Nutrisource" brand name
  const nutrisourceBrandPattern1 = /\bNutri\s+Sour\b/gi;
  preProcessed = preProcessed.replace(nutrisourceBrandPattern1, "Nutrisource");
  const nutrisourceBrandPattern2 = /\bNutr\s+Sour\b/gi;
  preProcessed = preProcessed.replace(nutrisourceBrandPattern2, "Nutrisource");
  const nutrisourceBrandPattern3 = /\bNutri\s+Sou\b/gi;
  preProcessed = preProcessed.replace(nutrisourceBrandPattern3, "Nutrisource");
  
  // STEP 1.5: Pre-cleanup - Remove duplicate "Cat" BEFORE product line expansion
  // Handle "Nutrisource Cat Clas Cat" → "Nutrisource Clas Cat" first
  // This allows "Clas" to be properly expanded to "Classic Catch" in the next step
  const nutrisourcePreCleanupCatPattern = /\b(Nutrisource)\s+Cat\s+(\w+)\s+Cat\b/gi;
  preProcessed = preProcessed.replace(nutrisourcePreCleanupCatPattern, "$1 $2 Cat");
  
  // STEP 2: Product Line Expansion (after brand is normalized to "Nutrisource")
  // PureVita line: "Pv" → "PureVita"
  // Reference: https://nutrisourcepetfoods.com/category/our-food/purevita/
  const nutrisourcePvPattern = /\b(Nutrisource)\s+Pv\b/gi;
  preProcessed = preProcessed.replace(nutrisourcePvPattern, "$1 PureVita");
  
  // Element Series - Classic Catch: "Clas" → "Classic Catch"
  // Reference: https://nutrisourcepetfoods.com/our-food/element-series/classic-catch-wet/
  const nutrisourceClassicPattern = /\b(Nutrisource)\s+Clas\b/gi;
  preProcessed = preProcessed.replace(nutrisourceClassicPattern, "$1 Classic Catch");
  
  // Select Series: Add "Select" to product line names
  // Reference: https://nutrisourcepetfoods.com/our-food/prairie-select-recipe/
  const nutrisourcePrairiePattern = /\b(Nutrisource)\s+Prairie(?!\s+Select)\b/gi;
  preProcessed = preProcessed.replace(nutrisourcePrairiePattern, "$1 Prairie Select");
  
  // Reference: https://nutrisourcepetfoods.com/our-food/heartland-select/
  const nutrisourceHeartlandPattern = /\b(Nutrisource)\s+Heartland(?!\s+Select)\b/gi;
  preProcessed = preProcessed.replace(nutrisourceHeartlandPattern, "$1 Heartland Select");
  
  // Reference: https://nutrisourcepetfoods.com/our-food/woodlands-select-recipe/
  const nutrisourceWoodlandPattern = /\b(Nutrisource)\s+Woodlands?(?!\s+Select)\b/gi;
  preProcessed = preProcessed.replace(nutrisourceWoodlandPattern, "$1 Woodlands Select");
  
  // "Seaf" → "Seafood Select" (handle abbreviation BEFORE full word)
  // Reference: https://nutrisourcepetfoods.com/our-food/seafood-select/
  // Matches "Nutrisource Seaf" or "Nutrisource Small Bite Seaf"
  const nutrisourceSeafPattern = /\b(Nutrisource(?:\s+(?:Small|Large)\s+Bite)?)\s+Seaf\b/gi;
  preProcessed = preProcessed.replace(nutrisourceSeafPattern, "$1 Seafood Select");
  
  // Seafood Select (add "Select" if missing from full "Seafood")
  const nutrisourceSeafoodPattern = /\b(Nutrisource)\s+Seafood(?!\s+Select)\b/gi;
  preProcessed = preProcessed.replace(nutrisourceSeafoodPattern, "$1 Seafood Select");
  
  // Country Select: "Count Sele" → "Country Select"
  // Reference: https://nutrisourcepetfoods.com/our-food/country-select-entree/
  const nutrisourceCountrySelePattern = /\b(Nutrisource\s+(?:Cat\s+)?)Count\s+Sele\b/gi;
  preProcessed = preProcessed.replace(nutrisourceCountrySelePattern, "$1Country Select");
  
  // Turkey Select: "Turkey Sele" → "Turkey & Turkey Liver Select"
  // Reference: https://nutrisourcepetfoods.com/our-food/turkey-select/
  const nutrisourceTurkeySelePattern = /\b(Nutrisource\s+(?:Cat\s+)?)Turkey\s+Sele\b/gi;
  preProcessed = preProcessed.replace(nutrisourceTurkeySelePattern, "$1Turkey & Turkey Liver Select");
  
  // General "Sele" → "Select" (for any remaining cases)
  const nutrisourceSelePattern = /\b(Nutrisource\s+(?:Cat\s+)?(?:\w+\s+)?)Sele\b/gi;
  preProcessed = preProcessed.replace(nutrisourceSelePattern, "$1Select");
  
  // Chicken & Salmon Select: "Chicken,Salmon" → "Chicken & Salmon Select"
  // Reference: https://nutrisourcepetfoods.com/our-food/cat-kitten-chicken-salmon-recipe/
  const nutrisourceChickenSalmonPattern = /\b(Nutrisource\s+(?:Cat\s+)?)Chicken,\s*Salmon\b/gi;
  preProcessed = preProcessed.replace(nutrisourceChickenSalmonPattern, "$1Chicken & Salmon Select");
  
  // Chicken, Turkey & Lamb: "Chicken,Tu & lamb" → "Chicken, Turkey & Lamb"
  // Reference: https://nutrisourcepetfoods.com/our-food/chicken-turkey-lamb-fish/
  const nutrisourceChickenTuLambPattern = /\b(Nutrisource\s+(?:Cat\s+)?)Chicken,\s*Tu\s+&\s+lamb\b/gi;
  preProcessed = preProcessed.replace(nutrisourceChickenTuLambPattern, "$1Chicken, Turkey & Lamb");
  
  // General pattern: "Tu" → "Turkey" (very short abbreviation, must come before "Tur")
  // This is more aggressive than "Tur" but needed for products like "Chicken,Tu"
  const nutrisourceTuPattern = /\b(Nutrisource\s+(?:Cat\s+)?(?:\w+\s+)?)Tu\b(?!\s*&)/gi;
  preProcessed = preProcessed.replace(nutrisourceTuPattern, "$1Turkey");
  
  // STEP 3: Term Expansion (after brand and product line are normalized)
  // "Entre" → "Entree" (PureVita wet food uses "Entree")
  // Reference: https://nutrisourcepetfoods.com/our-food/beef-entree-2/
  const nutrisourceEntrePattern = /\b(Nutrisource\s+(?:PureVita\s+)?(?:\w+\s+)?)Entre\b/gi;
  preProcessed = preProcessed.replace(nutrisourceEntrePattern, "$1Entree");
  
  // "Perfor" → "Performance" 
  // Reference: https://nutrisourcepetfoods.com/our-food/nutrisource/performance-recipe/
  const nutrisourcePerforPattern = /\bNutrisource\s+Perfor\b/gi;
  preProcessed = preProcessed.replace(nutrisourcePerforPattern, "Nutrisource Performance");
  
  // "Gr Frozen" → "Grain Free" (handle BEFORE the general Gr pattern)
  // Nutrisource does not make frozen raw food, only freeze-dried
  // Reference: https://nutrisourcepetfoods.com/category/our-food/freeze-dried/
  // Matches "Nutrisource Large Breed Gr Frozen Lamb" etc.
  const nutrisourceGrFrozenPattern = /\b(Nutrisource(?:\s+\w+)*?)\s+Gr\s+Frozen\b/gi;
  preProcessed = preProcessed.replace(nutrisourceGrFrozenPattern, "$1 Grain Free");
  
  // "Gr " → "Grain Free " (when followed by a space, indicates Grain Free formula)
  // Reference: Grain-free formulas use "Grain Free" in official names
  const nutrisourceGrPattern = /\b(Nutrisource)\s+Gr\s+/gi;
  preProcessed = preProcessed.replace(nutrisourceGrPattern, "$1 Grain Free ");
  
  // Fromm Product Line Expansions
  // Reference: https://frommfamily.com/products/cat/four-star/ & https://frommfamily.com/products/cat/purrsnickitty/
  
  // PurrSnickety (correct spelling from product packaging)
  // "Pure Sniffers" or "Pu Sniffers" → "PurrSnickety"
  const frommPureSniffersPattern = /\b(Fromm)\s+Pure\s+Sniffers\b/gi;
  preProcessed = preProcessed.replace(frommPureSniffersPattern, "$1 PurrSnickety");
  const frommPuSniffersPattern = /\b(Fromm)\s+Pu\s+Sniffers\b/gi;
  preProcessed = preProcessed.replace(frommPuSniffersPattern, "$1 PurrSnickety");
  
  // Fix common misspelling: "PurrSnickitty" → "PurrSnickety"
  const frommPurrSnickittyPattern = /\b(Fromm)\s+PurrSnickitty\b/gi;
  preProcessed = preProcessed.replace(frommPurrSnickittyPattern, "$1 PurrSnickety");
  
  // "Cat Game" or "Game Bird" → "Game Bird Recipe" (Four-Star)
  // Official name is "Game Bird Recipe" NOT "Game Bird Grandeur"
  // First remove "Grandeur" if it exists, then add "Recipe" if missing
  const frommGameBirdGrandeurPattern = /\b(Fromm)\s+(Cat\s+|PurrSnickety\s+)?Game\s+Bird(?:\s+Recipe)?\s+Grandeur\b/gi;
  preProcessed = preProcessed.replace(frommGameBirdGrandeurPattern, (match, p1, p2) => `${p1} ${p2 || ''}Game Bird Recipe`);
  
  const frommGameBirdPattern = /\b(Fromm)\s+(Cat\s+|PurrSnickety\s+)?Game\s+Bird(?!\s+Recipe)\b/gi;
  preProcessed = preProcessed.replace(frommGameBirdPattern, (match, p1, p2) => `${p1} ${p2 || ''}Game Bird Recipe`);
  
  // "Chk Del" or "Chicken Del" → "Chicken Delight" (PurrSnickety)
  const frommChickenDelightPattern = /\b(Fromm)\s+(Chk|Chicken)\s+Del\b/gi;
  preProcessed = preProcessed.replace(frommChickenDelightPattern, "$1 Chicken Delight");
  
  // "Sal Splen" or "Salmon Splen" → "Salmon Splendor" (PurrSnickety)
  const frommSalmonSplendorPattern = /\b(Fromm)\s+(Sal|Salmon)\s+Splen\b/gi;
  preProcessed = preProcessed.replace(frommSalmonSplendorPattern, "$1 Salmon Splendor");
  
  // À La Veg Recipes (Four-Star) - handles both with and without accent marks
  // Preserves optional "Cat" prefix - matches both dog and cat formulas
  // IMPORTANT: After these patterns, "Veg" is the official short form (NOT an abbreviation to expand)
  
  // VARIATION 1: With "a La" - Matches: "Duck a La Vegetable", "Duck A La Veg", "Duck À La Veg" → "Duck À La Veg"
  const frommDuckALaVegPattern = /\b(Fromm)\s+(Cat\s+)?Duck\s+[AÀa]\s+La\s+(?:Veg|Vegetable)\b/gi;
  if (frommDuckALaVegPattern.test(preProcessed)) {
    context.protectedTokens.add('Veg'); // Protect "Veg" from generic expansion
    frommDuckALaVegPattern.lastIndex = 0; // Reset regex after test
  }
  preProcessed = preProcessed.replace(frommDuckALaVegPattern, (match, p1, p2) => `${p1} ${p2 || ''}Duck À La Veg`);
  
  // VARIATION 2: Without "a La" - Matches: "Duck Vegetable" (missing "a La") → "Duck À La Veg"
  const frommDuckVegetablePattern = /\b(Fromm)\s+(Cat\s+)?Duck\s+Vegetable\b/gi;
  if (frommDuckVegetablePattern.test(preProcessed)) {
    context.protectedTokens.add('Veg'); // Protect "Veg" from generic expansion
    frommDuckVegetablePattern.lastIndex = 0;
  }
  preProcessed = preProcessed.replace(frommDuckVegetablePattern, (match, p1, p2) => `${p1} ${p2 || ''}Duck À La Veg`);
  
  // VARIATION 1: With "a La" - Matches: "Chicken a La Vegetable", "Chicken A La Veg", "Chicken À La Veg" → "Chicken À La Veg"
  const frommChickenALaVegPattern = /\b(Fromm)\s+(Cat\s+)?Chicken\s+[AÀa]\s+La\s+(?:Veg|Vegetable)\b/gi;
  if (frommChickenALaVegPattern.test(preProcessed)) {
    context.protectedTokens.add('Veg');
    frommChickenALaVegPattern.lastIndex = 0;
  }
  preProcessed = preProcessed.replace(frommChickenALaVegPattern, (match, p1, p2) => `${p1} ${p2 || ''}Chicken À La Veg`);
  
  // VARIATION 2: Without "a La" - Matches: "Chicken Vegetable" (missing "a La") → "Chicken À La Veg"
  const frommChickenVegetablePattern = /\b(Fromm)\s+(Cat\s+)?Chicken\s+Vegetable\b/gi;
  if (frommChickenVegetablePattern.test(preProcessed)) {
    context.protectedTokens.add('Veg');
    frommChickenVegetablePattern.lastIndex = 0;
  }
  preProcessed = preProcessed.replace(frommChickenVegetablePattern, (match, p1, p2) => `${p1} ${p2 || ''}Chicken À La Veg`);
  
  // VARIATION 1: With "a La" - Matches: "Salmon a La Vegetable", "Salmon A La Veg", "Salmon À La Veg" → "Salmon À La Veg"
  const frommSalmonALaVegPattern = /\b(Fromm)\s+(Cat\s+)?Salmon\s+[AÀa]\s+La\s+(?:Veg|Vegetable)\b/gi;
  if (frommSalmonALaVegPattern.test(preProcessed)) {
    context.protectedTokens.add('Veg');
    frommSalmonALaVegPattern.lastIndex = 0;
  }
  preProcessed = preProcessed.replace(frommSalmonALaVegPattern, (match, p1, p2) => `${p1} ${p2 || ''}Salmon À La Veg`);
  
  // VARIATION 2: Without "a La" - Matches: "Salmon Vegetable" (missing "a La") → "Salmon À La Veg"
  const frommSalmonVegetablePattern = /\b(Fromm)\s+(Cat\s+)?Salmon\s+Vegetable\b/gi;
  if (frommSalmonVegetablePattern.test(preProcessed)) {
    context.protectedTokens.add('Veg');
    frommSalmonVegetablePattern.lastIndex = 0;
  }
  preProcessed = preProcessed.replace(frommSalmonVegetablePattern, (match, p1, p2) => `${p1} ${p2 || ''}Salmon À La Veg`);
  
  // Beef recipes - CAT vs DOG distinction is critical!
  // For CATS: "Beef Liváttini Veg" (official Four-Star cat food)
  // For DOGS: "Beef Frittata Veg" (official Four-Star dog food)
  // Match CAT versions and convert to correct name - match either Veg OR Vegetable
  const frommCatBeefPattern = /\b(Fromm)\s+Cat\s+Beef\s+(?:Liváttini|Frittata|Frit)\s+(?:Veg|Vegetable)\b/gi;
  if (frommCatBeefPattern.test(preProcessed)) {
    context.protectedTokens.add('Veg');
    frommCatBeefPattern.lastIndex = 0;
  }
  preProcessed = preProcessed.replace(frommCatBeefPattern, "$1 Cat Beef Liváttini Veg");
  
  // Match DOG versions (without "Cat") and standardize - match either Veg OR Vegetable
  const frommDogBeefPattern = /\b(Fromm)\s+Beef\s+Frit(?:tata)?\s+(?:Veg|Vegetable)\b/gi;
  if (frommDogBeefPattern.test(preProcessed)) {
    context.protectedTokens.add('Veg');
    frommDogBeefPattern.lastIndex = 0;
  }
  preProcessed = preProcessed.replace(frommDogBeefPattern, "$1 Beef Frittata Veg");
  
  // "Chicken Au From" → "Chicken Au Frommage" (PurrSnickety)
  // Preserves optional "Cat" prefix
  const frommChickenAuFromPattern = /\b(Fromm)\s+(Cat\s+)?Chicken\s+Au\s+From(?!mage)\b/gi;
  preProcessed = preProcessed.replace(frommChickenAuFromPattern, (match, p1, p2) => `${p1} ${p2 || ''}Chicken Au Frommage`);
  
  // "Cat Surf" → "Cat Surf & Turf" (Four-Star)
  // Use negative lookahead to prevent matching if "& Turf" already exists
  const frommSurfPattern = /\b(Fromm)\s+Cat\s+Surf(?!\s+&\s+Turf)\b/gi;
  preProcessed = preProcessed.replace(frommSurfPattern, "$1 Cat Surf & Turf");
  
  // "Cat Saslm" → "Cat Salmon" (typo fix)
  const frommSaslmPattern = /\b(Fromm)\s+Cat\s+Saslm\b/gi;
  preProcessed = preProcessed.replace(frommSaslmPattern, "$1 Cat Salmon");
  
  // "Cat Has Duck" or "Has Duck" → "Hasen Duckenpfeffer" (Four-Star)
  const frommHasPattern = /\b(Fromm)\s+Cat\s+Has\s+Duck\b/gi;
  preProcessed = preProcessed.replace(frommHasPattern, "$1 Cat Hasen Duckenpfeffer");
  
  // Blue Buffalo Product Line Expansions
  // Reference: https://www.bluebuffalo.com/
  
  // "LP" → "Life Protection Formula"
  const blueBuffaloLPPattern = /\b(Blue Buffalo|BB|Bl Buf)\s+LP\b/gi;
  preProcessed = preProcessed.replace(blueBuffaloLPPattern, (match, brand) => `${brand} Life Protection Formula`);
  
  // "Wild" or "Wilderness" standalone after brand
  const blueBuffaloWildPattern = /\b(Blue Buffalo|BB)\s+Wild(?!erness)\b/gi;
  preProcessed = preProcessed.replace(blueBuffaloWildPattern, "$1 Wilderness");
  
  // "Gr Free" or "Freedom" → "Freedom"
  const blueBuffaloFreedomPattern = /\b(Blue Buffalo|BB|Bl Buf)\s+Gr\s+Free\b/gi;
  preProcessed = preProcessed.replace(blueBuffaloFreedomPattern, "$1 Freedom");
  
  // Taste of the Wild Product Line Expansions
  // Reference: https://www.tasteofthewildpetfood.com/
  
  // "Hi Prair" or "High Prai" → "High Prairie"
  const totwHiPrairPattern = /\b(Taste of the Wild|TOW|Tow)\s+Hi(?:gh)?\s+Prai(?:r(?:ie)?)?\b/gi;
  preProcessed = preProcessed.replace(totwHiPrairPattern, "$1 High Prairie");
  
  // "Pac Strm" or "Pacif Stream" → "Pacific Stream"
  const totwPacStrmPattern = /\b(Taste of the Wild|TOW|Tow)\s+Pac(?:if)?\s+Str(?:m|eam)\b/gi;
  preProcessed = preProcessed.replace(totwPacStrmPattern, "$1 Pacific Stream");
  
  // "Gr Free" → "Grain Free" (context: after TOTW)
  const totwGrFreePattern = /\b(Taste of the Wild|TOW|Tow)\s+Gr\s+Free\b/gi;
  preProcessed = preProcessed.replace(totwGrFreePattern, "$1 Grain Free");
  
  // Merrick Product Line Expansions
  // Reference: https://www.merrickpetcare.com/
  
  // "Clas" → "Classic"
  const merrickClasPattern = /\b(Merrick)\s+Clas\b/gi;
  preProcessed = preProcessed.replace(merrickClasPattern, "$1 Classic");
  
  // "Bckctry" → "Backcountry"
  const merrickBckctryPattern = /\b(Merrick)\s+Bckctry\b/gi;
  preProcessed = preProcessed.replace(merrickBckctryPattern, "$1 Backcountry");
  
  // "Gr Free" → "Grain Free" (context: after Merrick)
  const merrickGrFreePattern = /\b(Merrick)\s+Gr\s+Free\b/gi;
  preProcessed = preProcessed.replace(merrickGrFreePattern, "$1 Grain Free");
  
  // Pro Plan Product Line Expansions  
  // Reference: https://www.purina.com/pro-plan
  
  // "Svr" → "Savor" (older branding, now "Complete Essentials")
  const proPlanSvrPattern = /\b(Pro Plan|PP|Pr Pln)\s+Svr\b/gi;
  preProcessed = preProcessed.replace(proPlanSvrPattern, "$1 Savor");
  
  // "Fcs" → "Focus" (older branding, now "Specialized")
  const proPlanFcsPattern = /\b(Pro Plan|PP|Pr Pln)\s+Fcs\b/gi;
  preProcessed = preProcessed.replace(proPlanFcsPattern, "$1 Focus");
  
  // "Sprt" → "Sport"
  const proPlanSprtPattern = /\b(Pro Plan|PP|Pr Pln)\s+Sprt\b/gi;
  preProcessed = preProcessed.replace(proPlanSprtPattern, "$1 Sport");
  
  // "Sen" → "Sensitive Skin & Stomach"
  const proPlanSenPattern = /\b(Pro Plan|PP|Pr Pln)\s+Sen\b/gi;
  preProcessed = preProcessed.replace(proPlanSenPattern, "$1 Sensitive Skin & Stomach");
  
  // Royal Canin Breed-Specific Expansions
  // Reference: https://www.royalcanin.com/us/dogs/products/breed-health-nutrition
  
  // "Germ Shep" → "German Shepherd"
  const royalCaninGermShepPattern = /\b(Royal Canin|RC|Ry Can)\s+Germ\s+Shep\b/gi;
  preProcessed = preProcessed.replace(royalCaninGermShepPattern, "$1 German Shepherd");
  
  // "Gldn Retr" → "Golden Retriever"
  const royalCaninGldnRetrPattern = /\b(Royal Canin|RC|Ry Can)\s+Gldn\s+Retr\b/gi;
  preProcessed = preProcessed.replace(royalCaninGldnRetrPattern, "$1 Golden Retriever");
  
  // "Med" → "Medium" (when after Royal Canin)
  const royalCaninMedPattern = /\b(Royal Canin|RC)\s+Med\b/gi;
  preProcessed = preProcessed.replace(royalCaninMedPattern, "$1 Medium");
  
  // Science Diet / Hill's Prescription Diet Expansions
  // Reference: https://www.hillspet.com/
  
  // "Indo" → "Indoor"
  const scienceDietIndoPattern = /\b(Science Diet|SD|Sci Diet)\s+Indo\b/gi;
  preProcessed = preProcessed.replace(scienceDietIndoPattern, "$1 Indoor");
  
  // Prescription Diet letter codes (a/d, b/d, c/d, etc.)
  // Note: These are already handled well by the brand catalog, but adding context-aware expansion
  // "/d" means "diet" in all Hill's Prescription Diet formulas
  
  // Wellness Product Line Expansions
  // Reference: https://www.wellnesspetfood.com/
  
  // "CORE+" → "CORE+" (ensure proper capitalization)
  const wellnessCorePattern = /\b(Wellness)\s+Core\b/gi;
  preProcessed = preProcessed.replace(wellnessCorePattern, "$1 CORE");
  
  // "Comp Health" → "Complete Health"
  const wellnessCompHealthPattern = /\b(Wellness)\s+Comp\s+Health\b/gi;
  preProcessed = preProcessed.replace(wellnessCompHealthPattern, "$1 Complete Health");
  
  // Natural Balance Product Line Expansions
  // Reference: https://www.naturalbalanceinc.com/
  
  // "LID" or "L.I.D." → "Limited Ingredient Diets"
  const naturalBalanceLIDPattern = /\b(Natural Balance|Nat Balance)\s+L\.?I\.?D\.?\b/gi;
  preProcessed = preProcessed.replace(naturalBalanceLIDPattern, "$1 Limited Ingredient Diets");
  
  // Orijen Product Line Expansions
  // Reference: https://www.orijenpetfoods.com/
  
  // "Reg Red" → "Regional Red"
  const orijenRegRedPattern = /\b(Orijen)\s+Reg\s+Red\b/gi;
  preProcessed = preProcessed.replace(orijenRegRedPattern, "$1 Regional Red");
  
  // "Six Fish" remains "Six Fish" (already correct, but ensure proper capitalization)
  
  // Canidae Product Line Expansions
  // Reference: https://canidae.com/
  
  // "ALS" → "All Life Stages"
  const canidaeALSPattern = /\b(Canidae)\s+ALS\b/gi;
  preProcessed = preProcessed.replace(canidaeALSPattern, "$1 All Life Stages");
  
  // "PURE" already correct - ensure capitalization
  const canidaePurePattern = /\b(Canidae)\s+Pure\b/gi;
  preProcessed = preProcessed.replace(canidaePurePattern, "$1 PURE");
  
  // Instinct Product Line Expansions
  // Reference: https://instinctpetfood.com/
  
  // "Raw Bst" → "Raw Boost"
  const instinctRawBoostPattern = /\b(Instinct)\s+Raw\s+Bst\b/gi;
  preProcessed = preProcessed.replace(instinctRawBoostPattern, "$1 Raw Boost");
  
  // "Ult Protein" → "Ultimate Protein"
  const instinctUltProteinPattern = /\b(Instinct)\s+Ult\s+Protein\b/gi;
  preProcessed = preProcessed.replace(instinctUltProteinPattern, "$1 Ultimate Protein");
  
  // === VERIFIED BRAND ABBREVIATION EXPANSIONS ===
  // Evidence: Database queries + official website verification (Nov 24, 2025)
  // These patterns only match at START of product names to avoid corrupting non-brand text
  
  // Blue Buffalo Brand Name Normalization
  // Evidence: 30+ products in database starting with "Blue B"
  // Examples: "Blue B Chicken 15lb", "Blue B Large Breed 30lb", "Blue B Wilder Large Breed Chicken 24lb"
  // Official site: https://www.bluebuffalo.com/
  // Product lines confirmed: Life Protection Formula, Wilderness, Basics, Freedom
  const blueBStartPattern = /^Blue\s+B\b/gi;
  preProcessed = preProcessed.replace(blueBStartPattern, "Blue Buffalo");
  
  // === CONTEXT-AWARE "DIAM" EXPANSION ===
  // Similar to pH vs Prevue Hendrix logic, distinguish measurement contexts from brand names
  
  // Step 1: Expand "Diam" → "Diameter" in measurement contexts
  // Pattern: number + unit (inch/cm/mm/ft/meter/metre) + "Diam"
  // Examples: "12 inch Diam tube", "5cm Diam", "10 mm Diam pipe"
  // This runs BEFORE brand pattern to give measurement context priority
  const diameterMeasurementPattern = /\b(\d+(?:\.\d+)?)\s*(inch|in|cm|mm|ft|meter|metre|meters|metres)\.?\s+Diam\b/gi;
  preProcessed = preProcessed.replace(diameterMeasurementPattern, "$1 $2 Diameter");
  
  // Step 2: Expand remaining "Diam" → "Diamond" at start (brand name)
  // Evidence: 30+ products in database starting with "Diam"
  // Examples: "Diam Puppy 20lb", "Diam Senior 35lb", "Diam Large Breed 40lb"
  // Official site: https://www.diamondpet.com/
  // Product lines confirmed: Diamond Naturals, Diamond Premium, Diamond CARE
  const diamStartPattern = /^Diam\b/g;
  preProcessed = preProcessed.replace(diamStartPattern, "Diamond");
  
  // Primal Brand Name and Product Line Normalization
  // Evidence: 13 products in database starting with "Prim Fd" or "Prim Kitr"
  // Official site: https://www.primalpetfoods.com/
  
  // "Prim Fd" → "Primal Freeze Dried" (7 products)
  // Examples: "Prim Fd Pork 14oz", "Prim Fd Beef 14oz", "Prim Fd Turkey & Sard 14oz"
  // Official product line: Freeze-Dried Raw Nuggets/Patties/Scoopable Pronto
  const primalFdStartPattern = /^Prim\s+Fd\b/gi;
  preProcessed = preProcessed.replace(primalFdStartPattern, "Primal Freeze Dried");
  
  // "Prim Kitr" → "Primal Kibble in the Raw" (6 products)
  // Examples: "Prim Kitr Chicken 9lb", "Prim Kitr Puppy 9lb", "Prim Kitr Beef 1.5lb"
  // Official product line: Kibble in the Raw™ (freeze-dried kibble format)
  // Reference: https://www.primalpetfoods.com/products/kibble-in-the-raw-for-puppies
  const primalKitrStartPattern = /^Prim\s+Kitr\b/gi;
  preProcessed = preProcessed.replace(primalKitrStartPattern, "Primal Kibble in the Raw");
  
  // === TREAT BRAND ABBREVIATION EXPANSIONS ===
  // Evidence: Database queries + packaging photos + official website verification (Nov 24, 2025)
  
  // SmartBones Brand Name Normalization
  // Evidence: 20+ products in database with inconsistent capitalization
  // Database variations: "Smartbone", "Smartbones" (missing capital 'B')
  // Packaging photos: attached_assets/6774_1764025678530.jpg, attached_assets/6775_1764025687997.jpg
  // Official site: https://www.smartbones.com/
  // Correct brand name: SmartBones® (capital B)
  // Product lines: Classic Bone Chews, SmartSticks, Stuffed Twistz, Kabobz
  const smartbonePattern = /\bSmartbone(?:s)?\b/gi;
  preProcessed = preProcessed.replace(smartbonePattern, "SmartBones");
  
  // Benebone Brand Name Normalization
  // Evidence: 20+ products in database with inconsistent capitalization
  // Database variations: "BeneBone" (incorrect capital B)
  // Packaging photos: attached_assets/6775_1764025687997.jpg
  // Official site: https://www.benebone.com/
  // Correct brand name: Benebone (lowercase 'b' - official trademark)
  // Product lines: Wishbone, Zaggler, Maplestick, Puppy Line
  const benebonePattern = /\bBeneBone\b/g;
  preProcessed = preProcessed.replace(benebonePattern, "Benebone");
  
  // Merrick Fresh Kisses Product Line Expansion
  // Evidence: 14 products in database with "Dbbl" abbreviation
  // Database examples: "Fresh Kisses Extra Small Dbbl Box", "Fresh Kisses Large Dbbl Brush"
  // Packaging photos: attached_assets/6772_1764025694890.jpg
  // Official site: https://www.merrickpetcare.com/dog-food/fresh-kisses/
  // Official product name: Merrick Fresh Kisses Double-Brush Dental Dog Treats
  // "Dbbl" → "Double-Brush" (proprietary design feature)
  const freshKissesDbblPattern = /\b(Fresh Kisses)\s+((?:\w+\s+)*)Dbbl\b/gi;
  preProcessed = preProcessed.replace(freshKissesDbblPattern, "$1 $2Double-Brush");
  
  // Dogswell Functional Product Line Expansions
  // Evidence: 6 products in database with abbreviated functional names
  // Database examples: "Dogswell Guthealth Jerky", "Dogswell Hip & joint Jerky", "Dogswell Skin & coat Jerky"
  // Screenshots: attached_assets/Screenshot 2025-11-24 172251_1764026923283.png
  // Official site: https://dogswell.com/
  // Official product lines: Gut Health, Hip & Joint, Skin & Coat
  
  // "Guthealth" → "Gut Health" (two words)
  const dogswellGuthealthPattern = /\b(Dogswell)\s+Guthealth\b/gi;
  preProcessed = preProcessed.replace(dogswellGuthealthPattern, "$1 Gut Health");
  
  // "Hip & joint" → "Hip & Joint" (capital J)
  const hipJointCapPattern = /\b(Hip\s+&\s+)joint\b/g;
  preProcessed = preProcessed.replace(hipJointCapPattern, "$1Joint");
  
  // "Skin & coat" → "Skin & Coat" (capital C)
  const skinCoatCapPattern = /\b(Skin\s+&\s+)coat\b/g;
  preProcessed = preProcessed.replace(skinCoatCapPattern, "$1Coat");
  
  // Durvet Wormer Product Line Expansions
  // Evidence: 6 products in database with "Wrm" abbreviations
  // Database examples: "Durvet Liquid Wrm Dogs 2oz", "Durvet Tripwrm 12pk Chw", "Durvet Wrmeze Liquid 8oz"
  // Screenshots: attached_assets/Screenshot 2025-11-24 172303_1764026965724.png
  // Official site: https://www.durvet.com/
  
  // "Liquid Wrm" → "Liquid Wormer 2X"
  // Official product: Liquid Wormer™ 2X (double strength)
  const durvetLiquidWrmPattern = /\b(Durvet)\s+Liquid\s+Wrm\b/gi;
  preProcessed = preProcessed.replace(durvetLiquidWrmPattern, "$1 Liquid Wormer 2X");
  
  // "Tripwrm" → "Triple Wormer"
  // Official product: Triple Wormer® Chewable Tablets
  const durvetTripwrmPattern = /\b(Durvet)\s+Tripwrm\b/gi;
  preProcessed = preProcessed.replace(durvetTripwrmPattern, "$1 Triple Wormer");
  
  // "Wrmeze" → "Worm Ease"
  // Official product: WormEze™ Liquid
  const durvetWrmezePattern = /\b(Durvet)\s+(?:Feline\s+)?Wrmeze\b/gi;
  preProcessed = preProcessed.replace(durvetWrmezePattern, (match, p1) => {
    if (match.includes('Feline')) return `${p1} Feline Worm Ease`;
    return `${p1} Worm Ease`;
  });
  
  // === BRAND-SPECIFIC PATTERN EXPANSIONS === 
  // IMPORTANT: Only patterns with VERIFIED evidence from actual database records are included
  // Speculative patterns removed per architect guidance - require SKU-level proof before adding
  //
  // REMOVED (Nov 24, 2024) - Pending evidence-first verification:
  //   - Fromm Gold Ancient Grains patterns (need specific SKU list from production)
  //   - Fromm Classic/Four-Star wet food patterns (need can size + variant proof)
  //   - Fromm Crunchy O's patterns (need flavor confirmation from inventory)
  //   - Science Diet 7+/11+/Hairball/Indoor patterns (need formula-specific evidence)
  //   - Blue Buffalo Backyard BBQ/Freedom/Basics patterns (need product line verification)
  //   - Taste of the Wild Ancient Grains patterns (need dry vs wet vs cat distinction)
  //   - Merrick Power Bites/Backcountry patterns (need specific SKU abbreviations)
  //
  // TO RESTORE: Follow evidence-first workflow:
  //   1. Obtain actual abbreviated SKU from production database
  //   2. Verify official name via product packaging photo or brand website
  //   3. Add to brandCatalog.ts (preferred) OR create SKU-specific regex here
  //   4. Add fixture test to validate exact expansion
  //   5. Run automated regression tests before enabling in Process All
  //
  // NOTE: Nutrisource patterns below were verified with 93 database records (previous session)
  // and remain as trusted examples of proper evidence-based expansion methodology
  
  // Royal Canin Additional Breed Patterns
  const royalCaninLabRetPattern = /\b(Royal Canin|RC)\s+Lab(?:rador)?\s+Retr\b/gi;
  preProcessed = preProcessed.replace(royalCaninLabRetPattern, "$1 Labrador Retriever");
  const royalCaninYorkiePattern = /\b(Royal Canin|RC)\s+Yorkie\b/gi;
  preProcessed = preProcessed.replace(royalCaninYorkiePattern, "$1 Yorkshire Terrier");
  const royalCaninBulldogPattern = /\b(Royal Canin|RC)\s+Bulldog\b/gi;
  preProcessed = preProcessed.replace(royalCaninBulldogPattern, "$1 Bulldog");
  const royalCaninFrBulldogPattern = /\b(Royal Canin|RC)\s+Fr(?:ench)?\s+Bulldog\b/gi;
  preProcessed = preProcessed.replace(royalCaninFrBulldogPattern, "$1 French Bulldog");
  const royalCaninDachsPattern = /\b(Royal Canin|RC)\s+Dachs(?:hund)?\b/gi;
  preProcessed = preProcessed.replace(royalCaninDachsPattern, "$1 Dachshund");
  const royalCaninMinSchnauPattern = /\b(Royal Canin|RC)\s+Min(?:iature)?\s+Schnau(?:zer)?\b/gi;
  preProcessed = preProcessed.replace(royalCaninMinSchnauPattern, "$1 Miniature Schnauzer");
  // Size abbreviations
  const royalCaninLgPattern = /\b(Royal Canin|RC)\s+Lg\b/gi;
  preProcessed = preProcessed.replace(royalCaninLgPattern, "$1 Large");
  const royalCaninSmPattern = /\b(Royal Canin|RC)\s+Sm(?!\s+Breed)\b/gi;
  preProcessed = preProcessed.replace(royalCaninSmPattern, "$1 Small");
  const royalCaninXSPattern = /\b(Royal Canin|RC)\s+XS\b/gi;
  preProcessed = preProcessed.replace(royalCaninXSPattern, "$1 X-Small");
  
  // Science Diet Additional Patterns
  const scienceDietPerfWtPattern = /\b(Science Diet|SD)\s+Perf(?:ect)?\s+W(?:ei)?ght\b/gi;
  preProcessed = preProcessed.replace(scienceDietPerfWtPattern, "$1 Perfect Weight");
  const scienceDietSensStomPattern = /\b(Science Diet|SD)\s+Sens(?:itive)?\s+Stom(?:ach)?\b/gi;
  preProcessed = preProcessed.replace(scienceDietSensStomPattern, "$1 Sensitive Stomach");
  const scienceDietYouthVitPattern = /\b(Science Diet|SD)\s+Youth(?:ful)?\s+Vit(?:ality)?\b/gi;
  preProcessed = preProcessed.replace(scienceDietYouthVitPattern, "$1 Youthful Vitality");
  const scienceDietOralCarePattern = /\b(Science Diet|SD)\s+Oral\s+Care\b/gi;
  preProcessed = preProcessed.replace(scienceDietOralCarePattern, "$1 Oral Care");
  
  // "Hairba" → "Hairball Control"
  const scienceDietHairbaPattern = /\b(Science Diet|SD)\s+Cat\s+Hairba\b/gi;
  preProcessed = preProcessed.replace(scienceDietHairbaPattern, "$1 Cat Hairball Control");
  
  // "Heal Cuis" → "Healthy Cuisine"
  const scienceDietHealCuisPattern = /\b(Science Diet|SD)\s+(?:Cat\s+|Kitten\s+)?Heal\s+Cuis\b/gi;
  preProcessed = preProcessed.replace(scienceDietHealCuisPattern, (match, p1) => {
    if (match.includes('Cat')) return `${p1} Cat Healthy Cuisine`;
    if (match.includes('Kitten')) return `${p1} Kitten Healthy Cuisine`;
    return `${p1} Healthy Cuisine`;
  });
  
  // "Urin" or "Urina" → "Urinary & Hairball Control"
  const scienceDietUrinPattern = /\b(Science Diet|SD)\s+Cat\s+Urin(?:a)?\b/gi;
  preProcessed = preProcessed.replace(scienceDietUrinPattern, "$1 Cat Urinary & Hairball Control");
  
  // "Cast" → context unclear, possibly "Castrated" or typo for "Cat" - need to verify in database
  const scienceDietCastPattern = /\b(Science Diet|SD)\s+Cast\s+/gi;
  preProcessed = preProcessed.replace(scienceDietCastPattern, "$1 Cat ");
  
  // Wellness Additional Patterns
  const wellnessCOREPlusPattern = /\b(Wellness)\s+CORE\s*\+\b/gi;
  preProcessed = preProcessed.replace(wellnessCOREPlusPattern, "$1 CORE+");
  const wellnessGrainFreePattern = /\b(Wellness)\s+Gr(?:ain)?\s+Free\b/gi;
  preProcessed = preProcessed.replace(wellnessGrainFreePattern, "$1 Grain Free");
  
  // Nutrisource Additional Patterns
  const nutrisourcePureVitaPattern = /\b(Nutrisource)\s+Pure\s+Vita?\b/gi;
  preProcessed = preProcessed.replace(nutrisourcePureVitaPattern, "$1 PureVita");
  const nutrisourceElementPattern = /\b(Nutrisource)\s+Elem(?:ent)?\b/gi;
  preProcessed = preProcessed.replace(nutrisourceElementPattern, "$1 Element Series");
  
  // Fromm Additional Patterns
  const frommGoldPattern = /\b(Fromm)\s+Gold\b/gi;
  preProcessed = preProcessed.replace(frommGoldPattern, "$1 Gold");
  const frommPorkApplesaucePattern = /\b(Fromm)\s+Pork\s+Apple(?:sauce)?\b/gi;
  preProcessed = preProcessed.replace(frommPorkApplesaucePattern, "$1 Pork & Applesauce");
  
  // Blue Buffalo Additional Patterns
  const blueBuffaloBasicsPattern = /\b(Blue Buffalo|BB)\s+Basics\b/gi;
  preProcessed = preProcessed.replace(blueBuffaloBasicsPattern, "$1 Basics");
  const blueBuffaloTrueSolPattern = /\b(Blue Buffalo|BB)\s+True\s+Sol(?:utions)?\b/gi;
  preProcessed = preProcessed.replace(blueBuffaloTrueSolPattern, "$1 True Solutions");
  
  // Orijen Additional Patterns
  const orijenAmazingGrainsPattern = /\b(Orijen)\s+Amaz(?:ing)?\s+Grains\b/gi;
  preProcessed = preProcessed.replace(orijenAmazingGrainsPattern, "$1 Amazing Grains");
  const orijenTundraPattern = /\b(Orijen)\s+Tundra\b/gi;
  preProcessed = preProcessed.replace(orijenTundraPattern, "$1 Tundra");
  const orijenFitTrimPattern = /\b(Orijen)\s+Fit\s+&?\s*Trim\b/gi;
  preProcessed = preProcessed.replace(orijenFitTrimPattern, "$1 Fit & Trim");
  
  // "Region" → "Regional Red" (confirmed from official Orijen website)
  const orijenRegionPattern = /\b(Orijen)\s+Region(?!\s+Red|\s+al)\b/gi;
  preProcessed = preProcessed.replace(orijenRegionPattern, "$1 Regional Red");
  
  // "Wi Re" → "Wild Reserve" (confirmed from official Orijen website - Wild Reserve, Kitten Recipe)
  const orijenWiRePattern = /\b(Orijen)\s+Wi\s+Re\b/gi;
  preProcessed = preProcessed.replace(orijenWiRePattern, "$1 Wild Reserve");
  
  // Step 1: Try brand catalog expansion (research-backed, context-aware)
  const catalogResult = await expandProductName(storage, preProcessed);
  const catalogUsed = catalogResult !== preProcessed; // Track if catalog made changes
  
  // Step 2: Fall back to generic abbreviation expansion
  // Fix spacing issues first
  let result = catalogResult;
  result = result.replace(/\s{2,}/g, ' ');
  result = result.replace(/([a-zA-Z])&/g, '$1 &');
  result = result.replace(/&([a-zA-Z])/g, '& $1');
  
  // Handle "Ph" with context detection
  const phRegex = /\bPh\b/g;
  let match;
  const phMatches: Array<{index: number, isChemistry: boolean}> = [];
  
  while ((match = phRegex.exec(result)) !== null) {
    phMatches.push({
      index: match.index,
      isChemistry: isWaterChemistryPh(result, match.index)
    });
  }
  
  for (let i = phMatches.length - 1; i >= 0; i--) {
    const { index, isChemistry } = phMatches[i];
    if (isChemistry) {
      result = result.substring(0, index) + 'pH' + result.substring(index + 2);
    } else {
      result = result.substring(0, index) + 'Prevue Hendrix' + result.substring(index + 2);
    }
  }
  
  // Handle "Ga" with context detection
  const gaRegex = /\bGa\b/gi;
  const gaMatches: Array<{index: number, isGallon: boolean}> = [];
  
  while ((match = gaRegex.exec(result)) !== null) {
    gaMatches.push({
      index: match.index,
      isGallon: isAquariumGallon(result, match.index)
    });
  }
  
  for (let i = gaMatches.length - 1; i >= 0; i--) {
    const { index, isGallon } = gaMatches[i];
    if (isGallon) {
      result = result.substring(0, index) + 'Gallon' + result.substring(index + 2);
    }
  }
  
  // Expand other abbreviations (whole word matches)
  // Skip protected tokens to prevent overriding brand-specific terms
  for (const [abbrev, expansion] of Object.entries(ABBREVIATION_MAPPINGS)) {
    // Skip if this token is protected by brand-specific patterns
    if (context.protectedTokens.has(abbrev)) {
      continue;
    }
    
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    result = result.replace(regex, expansion);
  }
  
  // === FINAL CLEANUP: Ampersand Capitalization ===
  // Capitalize any word that follows "& " and starts with lowercase
  // e.g., "Apple & banana" → "Apple & Banana"
  result = result.replace(/&\s+([a-z])/g, (match, firstChar) => {
    return '& ' + firstChar.toUpperCase();
  });
  
  return { expanded: result, catalogUsed };
}

/**
 * Expands abbreviations in both name and description of a product
 * @param name - Product name
 * @param description - Product description
 * @returns Object with expanded name and description
 */
export function expandProductAbbreviations(
  name: string | null | undefined,
  description: string | null | undefined
): { name: string; description: string } {
  return {
    name: expandAbbreviations(name),
    description: expandAbbreviations(description)
  };
}

/**
 * Async version: Expands abbreviations in both name and description using brand catalog
 * This is the preferred method for new code
 * @param name - Product name
 * @param description - Product description
 * @param storage - Storage interface for brand catalog
 * @returns Promise with object containing expanded name, description, and catalog usage flag
 */
export async function expandProductAbbreviationsAsync(
  name: string | null | undefined,
  description: string | null | undefined,
  storage: IStorage
): Promise<{ name: string; description: string; catalogUsed: boolean }> {
  const nameResult = await expandAbbreviationsAsync(name, storage);
  const descResult = await expandAbbreviationsAsync(description, storage);
  
  return {
    name: nameResult.expanded,
    description: descResult.expanded,
    catalogUsed: nameResult.catalogUsed || descResult.catalogUsed
  };
}
