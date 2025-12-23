// Additional abbreviations found from audit
const additionalAbbrevs = {
  // Aqueon-specific
  'siphon': 'gravel vac',
  'quietflow': 'q flow',
  'airpump': 'air pump',
  'beautymax': 'beauty max',
  
  // Kong-specific  
  'ct': 'cat',
  'act': 'active',
  'dg': 'dog',
  
  // General
  'stry': 'story',
  'rbbt': 'rabbit',
  'bk': 'black',
  'trvl': 'travel',
  'excursion': 'excursion',
  'grmg': 'grooming',
  'snuggle': 'snuggle',
  'sck': 'sack',
  'lddr': 'ladder',
  'wd': 'wood',
  'rp': 'rope',
  'sd': 'seed',
  'lm': 'lemon',
  'min': 'mineral',
  'ppcrn': 'popcorn',
  'catcher': 'catcher',
  'carrier': 'carrier',
  'hut': 'hut',
  
  // Food/treat
  'yo': 'yogurt',
  'drops': 'drops',
  'cake': 'cake',
  'fdph': 'food dish',
  'hrbl': 'herbal',
  
  // Measurements (with numbers)
  '1pk': '1 pack',
  '2pk': '2 pack',
  '3pk': '3 pack',
  '4pk': '4 pack',
  '5pk': '5 pack',
  '10pk': '10 pack',
  '1ct': '1 count',
  '2ct': '2 count',
  '4ct': '4 count',
};

console.log(JSON.stringify(additionalAbbrevs, null, 2));
