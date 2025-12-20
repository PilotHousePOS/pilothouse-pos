// Comprehensive abbreviation expansion for pet product matching
export const abbreviations: Record<string, string[]> = {
  // Sizes
  'sm': ['small'],
  'md': ['medium', 'med'],
  'lg': ['large'],
  'xl': ['extra large', 'xlarge'],
  'xs': ['extra small', 'xsmall'],
  'xxl': ['extra extra large'],
  'xxs': ['extra extra small'],
  '3xs': ['triple extra small'],
  
  // Weights
  '#': ['lb', 'lbs', 'pound', 'pounds'],
  'lb': ['lbs', 'pound', 'pounds'],
  'lbs': ['lb', 'pound', 'pounds'],
  'oz': ['ounce', 'ounces'],
  'g': ['gram', 'grams'],
  'kg': ['kilogram', 'kilograms'],
  
  // Counts
  'pk': ['pack', 'ct', 'count'],
  'ct': ['count', 'pk', 'pack'],
  
  // Common words
  'ck': ['chicken', 'chkn'],
  'chkn': ['chicken', 'ck'],
  'bf': ['beef'],
  'lmb': ['lamb'],
  'slm': ['salmon'],
  'trk': ['turkey'],
  'tky': ['turkey'],
  'fsh': ['fish'],
  'ven': ['venison'],
  'dck': ['duck'],
  'rb': ['rabbit'],
  'pork': ['prk'],
  
  // Product types
  'cllr': ['collar'],
  'hrness': ['harness'],
  'lsh': ['leash'],
  'trncllr': ['training collar'],
  'bck': ['buckle', 'buck'],
  'nyl': ['nylon'],
  
  // Brand abbreviations
  'fro': ['frozen'],
  'nug': ['nuggets', 'nugget'],
  'pron': ['pronto'],
  'pup': ['puppy'],
  'kit': ['kitten'],
  'sen': ['senior'],
  'adlt': ['adult'],
  
  // Colors
  'blu': ['blue'],
  'grn': ['green'],
  'yel': ['yellow'],
  'pnk': ['pink'],
  'prp': ['purple'],
  'org': ['orange'],
  'blk': ['black'],
  'wht': ['white'],
  'gry': ['gray', 'grey'],
  'brn': ['brown'],
  'rd': ['red'],
  'pkb': ['pink bright'],
  
  // Pet types  
  'dg': ['dog'],
  'ct': ['cat'],
  
  // Food terms
  'fd': ['food'],
  'trt': ['treat', 'treats'],
  'trts': ['treats'],
  'chw': ['chew'],
  'bne': ['bone'],
  'bns': ['bones'],
  'cky': ['cookie'],
  'bsct': ['biscuit'],
  'kbbl': ['kibble'],
  'cn': ['can', 'canned'],
  'dry': ['dr'],
  'wet': ['wt'],
  
  // Health/care
  'shmp': ['shampoo'],
  'cond': ['conditioner'],
  'con': ['conditioner'],
  'med': ['medicated', 'medicine'],
  'vit': ['vitamin', 'vitamins'],
  'supp': ['supplement'],
  'hlth': ['health', 'healthy'],
  
  // Misc
  'ent': ['entree'],
  'pt': ['petite'],
  'orig': ['original'],
  'nat': ['natural'],
  'org': ['organic'],
  'gf': ['grain free'],
  'wf': ['wheat free'],
  'lf': ['limited ingredient'],
  'hi': ['high'],
  'lo': ['low'],
  'pro': ['protein'],
  'cal': ['calorie'],
  'w': ['with'],
  'w/': ['with'],
  '&': ['and'],
  'ri': ['rice'],
  
  // Equipment
  'tnk': ['tank'],
  'fltr': ['filter'],
  'pmp': ['pump'],
  'htr': ['heater'],
  'lght': ['light'],
  'lmp': ['lamp'],
  'bwl': ['bowl'],
  'dsh': ['dish'],
  'fdr': ['feeder'],
  'wtr': ['water'],
  
  // Brands often abbreviated
  'zmd': ['zoo med', 'zoomed'],
  'ext': ['exo terra', 'exoterra'],
  'api': ['a.p.i.'],
  'penn': ['penn plax', 'pennplax'],
  'fp': ['four paws', 'fourpaws'],
  'lp': ['lil pals', "li'l pals", 'lilpals'],
  'nm': ['natures miracle', "nature's miracle"],
  'ss': ['simple solution'],
  'fm': ['furminator'],
  'tc': ['tropiclean'],
  'mc': ['magic coat', 'magiccoat'],
  'ww': ['wee wee', 'weewee'],
  'jw': ['jw pet'],
  'sk': ['skouts honor', "skout's honor"],
  'wlns': ['wellness'],
  'bl': ['blue buffalo'],
  'sd': ['science diet'],
  'rc': ['royal canin'],
  'pp': ['pro plan', 'purina pro plan'],
  'ia': ['iams'],
  'ntr': ['nutro'],
  'ns': ['nutrisource'],
  'ttw': ['taste of the wild'],
  'ac': ['acana'],
  'orj': ['orijen'],
  'frm': ['fromm'],
  'prim': ['primal'],
  've': ['vital essentials'],
  'rb': ['redbarn'],
  'nyl': ['nylabone'],
  'kg': ['kong'],
  'cstl': ['coastal'],
};

// Expand a name using abbreviations
export function expandName(name: string): string[] {
  const lower = name.toLowerCase();
  const words = lower.split(/[\s\/\-]+/);
  const variants: string[] = [lower];
  
  // Generate variants by expanding each abbreviation
  for (const [abbr, expansions] of Object.entries(abbreviations)) {
    if (lower.includes(abbr)) {
      for (const exp of expansions) {
        const variant = lower.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), exp);
        if (variant !== lower) variants.push(variant);
      }
    }
  }
  
  return [...new Set(variants)];
}

// Normalize name for comparison
export function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
