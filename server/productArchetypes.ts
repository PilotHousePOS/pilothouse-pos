/**
 * Product Archetype System
 * Classifies products and generates appropriate, product-specific extended information
 * Ensures instruction labels match product type (food = feeding, grooming = application, etc.)
 */

export interface ProductArchetype {
  id: string;
  instructionLabel: string;
  getFeatures: (product: ProductInfo) => { highlights: string[] };
  getInstructions: (product: ProductInfo) => string;
}

export interface ProductInfo {
  name: string;
  brand: string | null;
  category: string;
  filterType: string | null;
  description: string | null;
}

// Helper to extract bed-specific attributes
function extractBedAttributes(name: string): {
  material?: string;
  filling?: string;
  shape?: string;
  feature?: string;
} {
  const nameLower = name.toLowerCase();
  
  // Materials
  const materialMatch = nameLower.match(/(canvas|fleece|plush|velvet|faux fur|microfiber|cotton|polyester|suede|chenille|corduroy|denim|nylon|sherpa|linen|orthopedic|memory foam)/);
  const material = materialMatch ? materialMatch[1] : undefined;
  
  // Filling types
  const fillingMatch = nameLower.match(/(memory foam|cedar|poly-?fill|fiberfill|gel|orthopedic|egg crate|recycled)/);
  const filling = fillingMatch ? fillingMatch[1] : undefined;
  
  // Shapes
  const shapeMatch = nameLower.match(/(bolster|donut|cave|tent|crate|mat|pad|nest|couch|sofa|cuddler|round|oval|rectangle|square)/);
  const shape = shapeMatch ? shapeMatch[1] : undefined;
  
  // Special features
  const featureMatch = nameLower.match(/(waterproof|washable|removable cover|reversible|heated|cooling|elevated|outdoor|travel|portable|anti-?anxiety|calming)/);
  const feature = featureMatch ? featureMatch[1] : undefined;
  
  return { material, filling, shape, feature };
}

// Helper to extract clothing attributes
function extractClothingAttributes(name: string): {
  style?: string;
  material?: string;
  closure?: string;
} {
  const nameLower = name.toLowerCase();
  
  const styleMatch = nameLower.match(/(sweater|hoodie|jacket|coat|vest|dress|polo|tank|pj|pajama|bandana|costume|raincoat)/);
  const materialMatch = nameLower.match(/(fleece|cotton|wool|knit|cable knit|polyester|nylon|denim|flannel)/);
  const closureMatch = nameLower.match(/(velcro|snap|button|zipper|pullover)/);
  
  return {
    style: styleMatch ? styleMatch[1] : undefined,
    material: materialMatch ? materialMatch[1] : undefined,
    closure: closureMatch ? closureMatch[1] : undefined,
  };
}

// Helper to extract product attributes from name
function extractAttributes(name: string): {
  size?: string;
  flavor?: string;
  species?: string;
  formFactor?: string;
  color?: string;
} {
  const nameLower = name.toLowerCase();
  
  const sizePatterns = [
    /(\d+(?:\.\d+)?\s*(?:oz|lb|lbs|g|kg|ml|l|gal|qt|ct|count|pk|pack))/i,
    /(small|medium|large|xl|x-large|mini|giant|jumbo)/i,
  ];
  
  const flavorPatterns = [
    /(chicken|beef|salmon|tuna|turkey|lamb|duck|pork|venison|bison|fish|whitefish|ocean|seafood)/i,
  ];
  
  const speciesPatterns = [
    /(dog|cat|puppy|kitten|bird|parrot|finch|canary|fish|betta|goldfish|tropical|cichlid|reptile|snake|gecko|bearded dragon|turtle|tortoise|frog|tadpole|hamster|guinea pig|rabbit|ferret|chinchilla|gerbil|mouse|rat)/i,
  ];
  
  const formFactorPatterns = [
    /(kibble|pellet|flake|freeze-dried|frozen|raw|wet|canned|dry|treats?|chew|biscuit|jerky|stick|spray|foam|gel|cream|lotion|powder|liquid|drops|tablet|capsule)/i,
  ];
  
  let size, flavor, species, formFactor, color;
  
  for (const pattern of sizePatterns) {
    const match = name.match(pattern);
    if (match) { size = match[1]; break; }
  }
  
  for (const pattern of flavorPatterns) {
    const match = nameLower.match(pattern);
    if (match) { flavor = match[1]; break; }
  }
  
  for (const pattern of speciesPatterns) {
    const match = nameLower.match(pattern);
    if (match) { species = match[1]; break; }
  }
  
  for (const pattern of formFactorPatterns) {
    const match = nameLower.match(pattern);
    if (match) { formFactor = match[1]; break; }
  }
  
  const colorMatch = nameLower.match(/(red|blue|green|yellow|orange|purple|pink|black|white|brown|gray|grey|tan|natural)/);
  if (colorMatch) color = colorMatch[1];
  
  return { size, flavor, species, formFactor, color };
}

// Product Archetypes
const archetypes: Record<string, ProductArchetype> = {
  // FOOD ARCHETYPES
  dryPetFood: {
    id: 'dryPetFood',
    instructionLabel: 'Feeding Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Premium';
      const highlights = [
        `${brand} dry ${attrs.flavor || 'protein'} formula`,
        attrs.species ? `Formulated specifically for ${attrs.species}s` : 'Complete and balanced nutrition',
        'High-quality protein sources',
        'Essential vitamins and minerals included',
      ];
      if (attrs.size) highlights.push(`Convenient ${attrs.size} size`);
      return { highlights };
    },
    getInstructions: (p) => {
      const attrs = extractAttributes(p.name);
      return `Feed according to your ${attrs.species || 'pet'}'s weight and activity level. Transition gradually over 7-10 days when switching foods. Provide fresh water at all times. Store in a cool, dry place.`;
    },
  },
  
  wetPetFood: {
    id: 'wetPetFood',
    instructionLabel: 'Feeding Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Premium';
      return {
        highlights: [
          `${brand} wet ${attrs.flavor || 'protein'} recipe`,
          'High moisture content for hydration',
          attrs.species ? `Made for ${attrs.species}s` : 'Palatable texture pets love',
          'No artificial preservatives',
          attrs.size ? `${attrs.size} can/pouch` : 'Convenient serving size',
        ],
      };
    },
    getInstructions: (p) => {
      const attrs = extractAttributes(p.name);
      return `Serve at room temperature for best palatability. Refrigerate unused portion and use within 3 days. Feed according to ${attrs.species || 'pet'} size and weight guidelines.`;
    },
  },
  
  rawFood: {
    id: 'rawFood',
    instructionLabel: 'Feeding Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Premium';
      return {
        highlights: [
          `${brand} raw ${attrs.flavor || 'protein'} diet`,
          attrs.formFactor === 'freeze-dried' ? 'Freeze-dried for convenience and nutrition retention' : 'Frozen to preserve nutrients',
          'Minimally processed whole ingredients',
          'Supports natural ancestral diet',
          'No artificial additives',
        ],
      };
    },
    getInstructions: (p) => {
      const attrs = extractAttributes(p.name);
      if (attrs.formFactor === 'freeze-dried') {
        return `Rehydrate with warm water before serving or feed dry as a treat. Store in cool, dry place. Follow package guidelines for portion sizes based on ${attrs.species || 'pet'} weight.`;
      }
      return `Thaw in refrigerator before serving. Handle as raw meat - wash hands and surfaces after handling. Feed within 3 days of thawing. Do not refreeze.`;
    },
  },
  
  fishFood: {
    id: 'fishFood',
    instructionLabel: 'Feeding Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      const fishType = attrs.species || 'fish';
      return {
        highlights: [
          `${brand} ${attrs.formFactor || 'formula'} for ${fishType}`,
          attrs.formFactor === 'flake' ? 'Flakes stay intact and won\'t cloud water' : 
            attrs.formFactor === 'pellet' ? 'Sinking/floating pellets for natural feeding' : 'Optimized for fish nutrition',
          'Enhances natural coloration',
          'Easy to digest, less waste',
          'Balanced nutrition for health and vitality',
        ],
      };
    },
    getInstructions: (p) => {
      return `Feed 2-3 times daily, only as much as fish can consume in 2-3 minutes. Remove uneaten food to maintain water quality. Store in a cool, dry place with lid tightly sealed.`;
    },
  },
  
  reptileFood: {
    id: 'reptileFood',
    instructionLabel: 'Feeding Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      const reptileType = attrs.species || 'reptile';
      return {
        highlights: [
          `${brand} diet formulated for ${reptileType}s`,
          'Species-appropriate nutrition profile',
          'Supports healthy growth and shell/scale development',
          'Fortified with calcium and vitamins',
          'Natural ingredients reptiles instinctively recognize',
        ],
      };
    },
    getInstructions: (p) => {
      const attrs = extractAttributes(p.name);
      const reptileType = attrs.species || 'reptile';
      return `Feed according to your ${reptileType}'s size and age. Dust with calcium supplement as directed. Remove uneaten food within 24 hours. Provide fresh water daily.`;
    },
  },
  
  smallAnimalFood: {
    id: 'smallAnimalFood',
    instructionLabel: 'Feeding Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      const animalType = attrs.species || 'small animal';
      return {
        highlights: [
          `${brand} ${attrs.formFactor || 'diet'} for ${animalType}s`,
          'Formulated for small animal digestive systems',
          'Supports dental health through natural chewing',
          'Essential vitamins and minerals',
          'No artificial colors or preservatives',
        ],
      };
    },
    getInstructions: (p) => {
      const attrs = extractAttributes(p.name);
      return `Feed fresh daily. Provide unlimited timothy hay alongside pelleted diet. Remove uneaten fresh foods within 24 hours. Always provide fresh water.`;
    },
  },
  
  treats: {
    id: 'treats',
    instructionLabel: 'Feeding Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Tasty';
      return {
        highlights: [
          `${brand} ${attrs.flavor || 'delicious'} ${attrs.formFactor || 'treats'}`,
          'Perfect for training and rewards',
          attrs.species ? `Made specifically for ${attrs.species}s` : 'Irresistible taste pets love',
          'Quality ingredients',
          attrs.size ? `${attrs.size} size` : 'Convenient treat size',
        ],
      };
    },
    getInstructions: (p) => {
      return `Feed as a treat or reward. Not a complete diet. Treats should not exceed 10% of daily caloric intake. Supervise your pet while enjoying. Store in a cool, dry place.`;
    },
  },
  
  chews: {
    id: 'chews',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Durable';
      return {
        highlights: [
          `${brand} ${attrs.flavor || 'satisfying'} chew`,
          'Supports dental health through natural chewing action',
          'Long-lasting entertainment',
          attrs.size ? `${attrs.size} size for appropriate chewing` : 'Size-appropriate for safe chewing',
          'Satisfies natural chewing instincts',
        ],
      };
    },
    getInstructions: (p) => {
      return `Select appropriate size for your pet - chew should be larger than their mouth to prevent swallowing. Supervise chewing sessions. Replace when worn down to prevent choking hazard. Not for aggressive chewers who break off large pieces.`;
    },
  },
  
  // GROOMING ARCHETYPES
  shampoo: {
    id: 'shampoo',
    instructionLabel: 'Application Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isOatmeal = nameLower.includes('oatmeal');
      const isAloe = nameLower.includes('aloe');
      const isMedicated = nameLower.includes('medicated') || nameLower.includes('flea') || nameLower.includes('tick');
      const highlights = [
        `${brand} professional-grade shampoo`,
      ];
      if (isOatmeal) highlights.push('Colloidal oatmeal soothes sensitive skin');
      if (isAloe) highlights.push('Aloe vera moisturizes and conditions');
      if (isMedicated) highlights.push('Active ingredients target specific skin conditions');
      highlights.push('pH balanced for pet skin');
      highlights.push('Gentle enough for regular use');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Wet coat thoroughly with warm water. Apply shampoo and massage into lather, working from neck to tail. Avoid eyes and ears. Rinse completely until water runs clear. Towel dry or blow dry on low heat.`;
    },
  },
  
  conditioner: {
    id: 'conditioner',
    instructionLabel: 'Application Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isOatmeal = nameLower.includes('oatmeal');
      const isAloe = nameLower.includes('aloe');
      const highlights = [
        `${brand} coat conditioner for soft, manageable fur`,
      ];
      if (isOatmeal) highlights.push('Oatmeal formula soothes and nourishes skin');
      if (isAloe) highlights.push('Aloe vera provides deep moisturizing');
      highlights.push('Detangles and reduces matting');
      highlights.push('Leaves coat shiny and healthy-looking');
      highlights.push('Safe for regular use');
      return { highlights };
    },
    getInstructions: (p) => {
      return `After shampooing, apply conditioner to wet coat. Massage through fur, focusing on areas prone to tangling. Leave on for 2-5 minutes for deep conditioning. Rinse thoroughly with warm water.`;
    },
  },
  
  groomingSpray: {
    id: 'groomingSpray',
    instructionLabel: 'Application Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isDeodorizing = nameLower.includes('deodoriz') || nameLower.includes('fresh');
      const isDetangling = nameLower.includes('detangl');
      const highlights = [
        `${brand} convenient spray formula`,
      ];
      if (isDeodorizing) highlights.push('Neutralizes odors for a fresh, clean scent');
      if (isDetangling) highlights.push('Detangles knots and prevents matting');
      highlights.push('Quick-dry, no-rinse formula');
      highlights.push('Perfect for between-bath freshening');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Shake well before use. Hold bottle 6-8 inches from coat and spray evenly. Avoid eyes and ears. Brush through coat for best results. Can be used daily as needed.`;
    },
  },
  
  groomingBrush: {
    id: 'groomingBrush',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isSlicker = nameLower.includes('slicker');
      const isDeshedding = nameLower.includes('deshed') || nameLower.includes('furminator');
      const isComb = nameLower.includes('comb');
      const highlights = [
        `${brand} professional grooming tool`,
      ];
      if (isSlicker) highlights.push('Fine wire bristles remove tangles and loose fur');
      if (isDeshedding) highlights.push('Reduces shedding up to 90%');
      if (isComb) highlights.push('Removes tangles and detects mats');
      highlights.push('Ergonomic handle for comfortable grooming sessions');
      highlights.push('Gentle on skin when used properly');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Brush in the direction of hair growth using gentle strokes. Start at the head and work toward the tail. Be extra gentle around sensitive areas. Groom regularly to prevent matting and reduce shedding.`;
    },
  },
  
  earCare: {
    id: 'earCare',
    instructionLabel: 'Application Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} ear care solution`,
          'Gentle formula safe for regular use',
          'Helps remove wax and debris',
          'Soothes and cleans ear canal',
          'Helps prevent ear infections',
        ],
      };
    },
    getInstructions: (p) => {
      return `Gently lift ear flap. Apply solution to ear canal. Massage base of ear for 30 seconds. Allow pet to shake head. Wipe away loosened debris with cotton ball. Do not insert anything into ear canal.`;
    },
  },
  
  dental: {
    id: 'dental',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isToothpaste = nameLower.includes('toothpaste') || nameLower.includes('paste');
      const isBrush = nameLower.includes('brush') || nameLower.includes('toothbrush');
      const highlights = [
        `${brand} dental care product`,
        'Helps reduce plaque and tartar buildup',
        'Freshens breath',
      ];
      if (isToothpaste) highlights.push('Pet-safe formula - safe if swallowed');
      if (isBrush) highlights.push('Designed for pet mouth shape and size');
      highlights.push('Supports overall oral health');
      return { highlights };
    },
    getInstructions: (p) => {
      const nameLower = p.name.toLowerCase();
      if (nameLower.includes('toothpaste') || nameLower.includes('paste')) {
        return `Apply small amount to pet toothbrush or finger brush. Gently brush teeth and gums in circular motions. Focus on the gum line where plaque accumulates. Use 2-3 times per week for best results.`;
      }
      return `Use with pet-safe toothpaste. Gently brush teeth in circular motions, focusing on outer surfaces. Start slowly to acclimate your pet. Brush 2-3 times weekly for optimal dental health.`;
    },
  },
  
  // HEALTHCARE ARCHETYPES
  supplements: {
    id: 'supplements',
    instructionLabel: 'Dosage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isJoint = nameLower.includes('joint') || nameLower.includes('hip') || nameLower.includes('glucosamine');
      const isDigestive = nameLower.includes('probiotic') || nameLower.includes('digestive');
      const isSkin = nameLower.includes('skin') || nameLower.includes('coat') || nameLower.includes('omega');
      const highlights = [`${brand} pet health supplement`];
      if (isJoint) highlights.push('Supports joint health and mobility');
      if (isDigestive) highlights.push('Promotes healthy digestion');
      if (isSkin) highlights.push('Supports healthy skin and shiny coat');
      highlights.push('Veterinarian formulated');
      highlights.push('Quality ingredients for pet wellness');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Give according to pet's weight as directed on package. Can be given with food. Start with half dose for sensitive pets. Consult veterinarian if pet has health conditions or takes medications.`;
    },
  },
  
  fleaTick: {
    id: 'fleaTick',
    instructionLabel: 'Application Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Effective';
      return {
        highlights: [
          `${brand} flea and tick protection`,
          'Kills fleas, ticks, and other parasites',
          'Long-lasting protection',
          'Breaks the flea life cycle',
          'Veterinarian recommended',
        ],
      };
    },
    getInstructions: (p) => {
      const nameLower = p.name.toLowerCase();
      if (nameLower.includes('collar')) {
        return `Place collar snugly around pet's neck - you should be able to fit two fingers between collar and neck. Trim excess length. Replace according to package directions. Not for use on sick or debilitated pets.`;
      }
      if (nameLower.includes('spot') || nameLower.includes('topical')) {
        return `Part fur between shoulder blades to expose skin. Apply entire contents directly to skin. Do not bathe for 48 hours before or after application. Apply monthly for continued protection.`;
      }
      return `Follow package directions carefully. Keep treated pets separated until product dries. Not for use on puppies/kittens under 8 weeks. Consult vet if pet has skin conditions.`;
    },
  },
  
  // ACCESSORY ARCHETYPES
  collar: {
    id: 'collar',
    instructionLabel: 'Fitting Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} ${attrs.color || 'stylish'} pet collar`,
          'Durable construction for everyday wear',
          'Secure buckle or clasp closure',
          'D-ring for ID tags and leash attachment',
          attrs.size ? `${attrs.size} size` : 'Adjustable for comfortable fit',
        ],
      };
    },
    getInstructions: (p) => {
      return `Measure your pet's neck and add 2 inches for proper fit. Collar should be snug but comfortable - you should be able to fit two fingers between collar and neck. Check fit regularly, especially for growing pets.`;
    },
  },
  
  leash: {
    id: 'leash',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isRetractable = nameLower.includes('retract');
      const highlights = [`${brand} ${attrs.color || 'durable'} leash`];
      if (isRetractable) highlights.push('Retractable design for variable-length control');
      highlights.push('Comfortable handle grip');
      highlights.push('Strong clasp for secure attachment');
      highlights.push('Built for daily walks and adventures');
      return { highlights };
    },
    getInstructions: (p) => {
      const nameLower = p.name.toLowerCase();
      if (nameLower.includes('retract')) {
        return `Attach securely to collar or harness. Lock leash at desired length. Keep unlocked button pressed to allow extension/retraction. Always maintain visual contact with your pet. Not recommended for untrained dogs.`;
      }
      return `Attach clip securely to collar or harness D-ring. Hold loop handle firmly during walks. Inspect regularly for fraying or wear. Replace if hardware shows damage.`;
    },
  },
  
  harness: {
    id: 'harness',
    instructionLabel: 'Fitting Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} ${attrs.color || 'comfortable'} harness`,
          'Distributes pressure away from neck',
          'Reduces pulling and provides better control',
          attrs.size ? `${attrs.size} size` : 'Adjustable straps for custom fit',
          'Secure buckles and D-ring attachment',
        ],
      };
    },
    getInstructions: (p) => {
      return `Loosen all straps before fitting. Place harness over pet's head or step-in as designed. Adjust straps for snug fit - you should be able to fit two fingers under any strap. Attach leash to back D-ring for walks.`;
    },
  },
  
  bed: {
    id: 'bed',
    instructionLabel: 'Care Instructions',
    getFeatures: (p) => {
      const bedAttrs = extractBedAttributes(p.name);
      const attrs = extractAttributes(p.name);
      const highlights: string[] = [];
      
      // Build factual, specific bullets based on detected attributes
      if (bedAttrs.shape) {
        highlights.push(`${bedAttrs.shape.charAt(0).toUpperCase() + bedAttrs.shape.slice(1)} style bed`);
      }
      if (bedAttrs.material) {
        highlights.push(`${bedAttrs.material.charAt(0).toUpperCase() + bedAttrs.material.slice(1)} fabric`);
      }
      if (bedAttrs.filling) {
        highlights.push(`${bedAttrs.filling} filling`);
      }
      if (bedAttrs.feature) {
        highlights.push(`${bedAttrs.feature.charAt(0).toUpperCase() + bedAttrs.feature.slice(1)}`);
      }
      if (attrs.size) {
        highlights.push(attrs.size);
      }
      
      // If no specific attributes found, use minimal factual description
      if (highlights.length === 0) {
        highlights.push('Indoor pet bed');
        highlights.push('Machine washable');
      }
      
      return { highlights };
    },
    getInstructions: (p) => {
      return `Spot clean or machine wash on gentle. Air dry or tumble dry low. Fluff to restore shape.`;
    },
  },
  
  // TOY ARCHETYPES
  chewToy: {
    id: 'chewToy',
    instructionLabel: 'Play & Safety Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const nameLower = p.name.toLowerCase();
      const highlights: string[] = [];
      
      // Detect material from name
      if (nameLower.includes('rubber')) highlights.push('Rubber');
      else if (nameLower.includes('nylon')) highlights.push('Nylon');
      else if (nameLower.includes('rope')) highlights.push('Rope');
      else if (nameLower.includes('plush')) highlights.push('Plush');
      
      if (attrs.size) highlights.push(attrs.size);
      if (attrs.color) highlights.push(attrs.color.charAt(0).toUpperCase() + attrs.color.slice(1));
      if (p.brand) highlights.push(`By ${p.brand}`);
      
      if (highlights.length === 0) highlights.push('Chew toy');
      
      return { highlights };
    },
    getInstructions: (p) => {
      return `Supervise play. Inspect for damage and replace when worn.`;
    },
  },
  
  fetchToy: {
    id: 'fetchToy',
    instructionLabel: 'Play Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const nameLower = p.name.toLowerCase();
      const highlights: string[] = [];
      
      if (nameLower.includes('ball')) highlights.push('Ball');
      else if (nameLower.includes('frisbee') || nameLower.includes('disc')) highlights.push('Disc/Frisbee');
      else highlights.push('Fetch toy');
      
      if (nameLower.includes('float')) highlights.push('Floats in water');
      if (attrs.color) highlights.push(attrs.color.charAt(0).toUpperCase() + attrs.color.slice(1));
      if (p.brand) highlights.push(`By ${p.brand}`);
      
      return { highlights };
    },
    getInstructions: (p) => {
      return `Supervise play. Rinse after outdoor use.`;
    },
  },
  
  interactiveToy: {
    id: 'interactiveToy',
    instructionLabel: 'Play Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Engaging';
      return {
        highlights: [
          `${brand} interactive pet toy`,
          'Stimulates mental engagement',
          'Relieves boredom and reduces destructive behavior',
          'Encourages problem-solving',
          'Great for independent or supervised play',
        ],
      };
    },
    getInstructions: (p) => {
      return `Introduce toy during supervised play. Show your pet how the toy works initially. Adjust difficulty level as pet learns. Clean regularly. Store in pet-accessible area for enrichment.`;
    },
  },
  
  plushToy: {
    id: 'plushToy',
    instructionLabel: 'Care & Play Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Cuddly';
      return {
        highlights: [
          `${brand} soft plush toy`,
          'Soft material for comfort and cuddling',
          attrs.color ? `Adorable ${attrs.color} design` : 'Fun, engaging design',
          'Great for light play and companionship',
          'Multiple squeakers or crinkle sounds for engagement',
        ],
      };
    },
    getInstructions: (p) => {
      return `For light to moderate chewers only. Supervise play and remove if pet begins destroying toy. Remove loose parts to prevent swallowing. Machine washable on gentle cycle. Replace when worn.`;
    },
  },
  
  // HABITAT ARCHETYPES
  aquarium: {
    id: 'aquarium',
    instructionLabel: 'Setup & Care Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} aquarium ${attrs.size ? `(${attrs.size})` : ''}`,
          'Crystal-clear glass or acrylic construction',
          'Silicone-sealed seams for leak prevention',
          'Suitable for freshwater or marine setups',
          'Provides a healthy environment for aquatic life',
        ],
      };
    },
    getInstructions: (p) => {
      return `Place on sturdy, level surface away from direct sunlight. Rinse with water only before setup (no soap). Add substrate, decorations, and fill with dechlorinated water. Cycle aquarium 4-6 weeks before adding fish.`;
    },
  },
  
  filter: {
    id: 'filter',
    instructionLabel: 'Setup & Maintenance Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} aquarium filtration system`,
          'Multi-stage filtration for clean, healthy water',
          'Quiet operation',
          attrs.size ? `Rated for ${attrs.size} tanks` : 'Appropriate flow rate for tank size',
          'Easy cartridge replacement',
        ],
      };
    },
    getInstructions: (p) => {
      return `Install according to included directions. Prime filter before starting. Replace cartridge monthly or as needed. Rinse biological media in tank water only. Clean impeller quarterly for optimal performance.`;
    },
  },
  
  heater: {
    id: 'heater',
    instructionLabel: 'Setup & Safety Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Reliable';
      return {
        highlights: [
          `${brand} aquarium heater`,
          'Accurate thermostat maintains stable temperature',
          'Shatterproof construction',
          attrs.size ? `${attrs.size} wattage for appropriate tank size` : 'Appropriate wattage for tank volume',
          'LED indicator light shows heating status',
        ],
      };
    },
    getInstructions: (p) => {
      return `Submerge fully before plugging in. Allow 30 minutes to acclimate to water temperature before adjusting. Set to desired temperature (76-80°F for most tropical fish). Unplug before water changes that expose heater.`;
    },
  },
  
  lighting: {
    id: 'lighting',
    instructionLabel: 'Setup & Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isLED = nameLower.includes('led');
      const isUVB = nameLower.includes('uvb') || nameLower.includes('uv-b');
      const highlights = [`${brand} lighting system`];
      if (isLED) highlights.push('Energy-efficient LED technology');
      if (isUVB) highlights.push('Provides essential UVB for calcium metabolism');
      highlights.push('Enhances viewing and natural appearance');
      highlights.push('Promotes natural day/night cycle');
      highlights.push('Long-lasting bulbs/LEDs');
      return { highlights };
    },
    getInstructions: (p) => {
      const nameLower = p.name.toLowerCase();
      if (nameLower.includes('uvb')) {
        return `Position 10-12 inches from basking spot. Replace every 6-12 months even if still lighting (UVB output decreases). Provide 10-12 hours daily. Use with appropriate fixture rated for wattage.`;
      }
      return `Install in appropriate fixture. Provide 8-12 hours of light daily using timer for consistency. Keep away from water splashing. Replace according to manufacturer recommendations.`;
    },
  },
  
  terrarium: {
    id: 'terrarium',
    instructionLabel: 'Setup & Care Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} reptile terrarium ${attrs.size ? `(${attrs.size})` : ''}`,
          'Front-opening doors for easy access',
          'Ventilation system for proper air flow',
          'Escape-proof design',
          'Accommodates heating and lighting fixtures',
        ],
      };
    },
    getInstructions: (p) => {
      return `Assemble on sturdy, level surface. Install lighting and heating equipment before adding substrate. Create temperature gradient with basking and cool zones. Add hides, climbing surfaces, and water dish. Mist as needed for humidity-loving species.`;
    },
  },
  
  substrate: {
    id: 'substrate',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isReptile = nameLower.includes('reptile') || nameLower.includes('terrarium');
      const isAquarium = nameLower.includes('aquarium') || nameLower.includes('gravel') || nameLower.includes('sand');
      const highlights = [`${brand} habitat substrate`];
      if (isReptile) highlights.push('Safe for reptile habitats');
      if (isAquarium) highlights.push('Aquarium-safe, won\'t alter water chemistry');
      highlights.push('Natural appearance');
      highlights.push('Easy to clean and maintain');
      highlights.push('Appropriate particle size for safety');
      return { highlights };
    },
    getInstructions: (p) => {
      const nameLower = p.name.toLowerCase();
      if (nameLower.includes('aquarium') || nameLower.includes('gravel')) {
        return `Rinse thoroughly until water runs clear before adding to aquarium. Spread evenly 2-3 inches deep. Vacuum during water changes to remove debris. Do not use soap.`;
      }
      return `Spread 2-4 inches deep in enclosure. Spot clean daily, removing waste and soiled areas. Replace completely every 4-6 weeks or as needed. Not for species that may ingest substrate.`;
    },
  },
  
  decoration: {
    id: 'decoration',
    instructionLabel: 'Setup Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Decorative';
      return {
        highlights: [
          `${brand} habitat decoration`,
          'Adds natural beauty to your setup',
          'Non-toxic, pet-safe materials',
          'Provides enrichment and hiding spots',
          'Easy to clean and rearrange',
        ],
      };
    },
    getInstructions: (p) => {
      return `Rinse with water before first use (no soap). Place securely in habitat. Clean during regular maintenance. Inspect for damage periodically and replace if sharp edges develop.`;
    },
  },
  
  cage: {
    id: 'cage',
    instructionLabel: 'Setup & Care Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} pet cage/habitat`,
          attrs.size ? `${attrs.size} dimensions` : 'Appropriate size for your pet',
          'Easy-access doors',
          'Secure latches prevent escapes',
          'Removable tray for easy cleaning',
        ],
      };
    },
    getInstructions: (p) => {
      return `Assemble according to included instructions. Place in well-ventilated area away from drafts and direct sunlight. Add appropriate bedding, food dishes, and enrichment items. Clean tray weekly and sanitize cage monthly.`;
    },
  },
  
  // LITTER & WASTE ARCHETYPES
  litter: {
    id: 'litter',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isClumping = nameLower.includes('clump');
      const isCrystal = nameLower.includes('crystal');
      const isNatural = nameLower.includes('natural') || nameLower.includes('pine') || nameLower.includes('corn');
      const highlights = [`${brand} cat litter`];
      if (isClumping) highlights.push('Fast-clumping formula for easy scooping');
      if (isCrystal) highlights.push('Crystal formula absorbs and traps odors');
      if (isNatural) highlights.push('Made from natural, biodegradable materials');
      highlights.push('Superior odor control');
      highlights.push('Low dust formula');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Fill clean litter box 3-4 inches deep. Scoop waste daily. Add litter as needed to maintain depth. Change completely every 2-4 weeks. Clean box with mild soap between changes.`;
    },
  },
  
  wasteBags: {
    id: 'wasteBags',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} waste bags`,
          'Strong and leak-proof',
          'Easy to open and tie',
          'Fits standard dispensers',
          'Responsible pet ownership essential',
        ],
      };
    },
    getInstructions: (p) => {
      return `Separate bag from roll at perforation. Use to pick up pet waste. Tie securely and dispose in appropriate trash receptacle. Wash hands after handling.`;
    },
  },
  
  // APPAREL/CLOTHING ARCHETYPES
  clothing: {
    id: 'clothing',
    instructionLabel: 'Care & Sizing Instructions',
    getFeatures: (p) => {
      const clothingAttrs = extractClothingAttributes(p.name);
      const attrs = extractAttributes(p.name);
      const highlights: string[] = [];
      
      // Build factual bullets from detected attributes
      if (clothingAttrs.style) {
        highlights.push(`${clothingAttrs.style.charAt(0).toUpperCase() + clothingAttrs.style.slice(1)}`);
      }
      if (clothingAttrs.material) {
        highlights.push(`${clothingAttrs.material.charAt(0).toUpperCase() + clothingAttrs.material.slice(1)} fabric`);
      }
      if (clothingAttrs.closure) {
        highlights.push(`${clothingAttrs.closure.charAt(0).toUpperCase() + clothingAttrs.closure.slice(1)} closure`);
      }
      if (attrs.color) {
        highlights.push(attrs.color.charAt(0).toUpperCase() + attrs.color.slice(1));
      }
      if (attrs.size) {
        highlights.push(attrs.size);
      }
      
      // Minimal fallback
      if (highlights.length === 0) {
        highlights.push('Dog apparel');
        highlights.push('Machine washable');
      }
      
      return { highlights };
    },
    getInstructions: (p) => {
      return `Measure chest and back length before ordering. Machine wash cold, lay flat to dry.`;
    },
  },
  
  // NAIL/CLAW CARE
  nailCare: {
    id: 'nailCare',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Professional';
      const nameLower = p.name.toLowerCase();
      const isTrimmer = nameLower.includes('trimmer') || nameLower.includes('clipper');
      const isGrinder = nameLower.includes('grinder') || nameLower.includes('dremel');
      const highlights = [`${brand} nail care tool`];
      if (isTrimmer) highlights.push('Sharp, precision cutting blades');
      if (isGrinder) highlights.push('Gentle grinding action reduces splitting');
      highlights.push('Ergonomic grip for control');
      highlights.push('Safe and effective for home grooming');
      highlights.push('Reduces risk of scratches and snags');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Trim only the clear tip of the nail, avoiding the pink quick. For dark nails, trim small amounts at a time. If bleeding occurs, apply styptic powder. Trim every 3-4 weeks. Reward your pet after each session.`;
    },
  },
  
  // SMALL ANIMAL ACCESSORIES (hammocks, tunnels, etc.)
  smallAnimalAccessory: {
    id: 'smallAnimalAccessory',
    instructionLabel: 'Setup Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Cozy';
      const nameLower = p.name.toLowerCase();
      const isHammock = nameLower.includes('hammock');
      const isTunnel = nameLower.includes('tunnel');
      const isCube = nameLower.includes('cube') || nameLower.includes('hideout') || nameLower.includes('hide');
      const isWheel = nameLower.includes('wheel');
      const highlights = [`${brand} small animal accessory`];
      if (isHammock) highlights.push('Soft, cozy resting spot');
      if (isTunnel) highlights.push('Encourages exploration and exercise');
      if (isCube) highlights.push('Provides secure hiding space');
      if (isWheel) highlights.push('Silent-running for nighttime exercise');
      highlights.push('Safe materials for small pets');
      highlights.push('Easy to install in cage or habitat');
      highlights.push('Enriches your pet\'s environment');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Attach securely to cage using included clips or hardware. Ensure no loose threads or sharp edges. Wash fabric items weekly. Inspect for damage and replace if worn.`;
    },
  },
  
  // WATER/FOOD BOWLS
  bowl: {
    id: 'bowl',
    instructionLabel: 'Care Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isStainless = nameLower.includes('stainless');
      const isCeramic = nameLower.includes('ceramic');
      const isPlastic = nameLower.includes('plastic');
      const isFountain = nameLower.includes('fountain');
      const highlights = [`${brand} pet feeding dish`];
      if (isStainless) highlights.push('Durable stainless steel construction');
      if (isCeramic) highlights.push('Heavy ceramic prevents tipping');
      if (isFountain) highlights.push('Circulating water encourages hydration');
      if (!isStainless && !isCeramic && !isPlastic) highlights.push('Sturdy, easy-clean design');
      highlights.push('Appropriate capacity for pet size');
      highlights.push('Non-slip base');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Wash before first use. Clean daily with hot soapy water. Replace water frequently for freshness. Dishwasher safe unless otherwise noted.`;
    },
  },
  
  // BIRD SUPPLIES
  birdAccessory: {
    id: 'birdAccessory',
    instructionLabel: 'Setup Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isPerch = nameLower.includes('perch');
      const isSwing = nameLower.includes('swing');
      const isToy = nameLower.includes('toy') || nameLower.includes('bell') || nameLower.includes('mirror');
      const isCuttlebone = nameLower.includes('cuttlebone') || nameLower.includes('cuttle');
      const highlights = [`${brand} bird enrichment item`];
      if (isPerch) highlights.push('Natural material for foot health');
      if (isSwing) highlights.push('Provides exercise and entertainment');
      if (isToy) highlights.push('Stimulates mental engagement');
      if (isCuttlebone) highlights.push('Essential calcium source');
      highlights.push('Safe for cage installation');
      highlights.push('Promotes natural bird behaviors');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Install securely in cage at appropriate height. Position away from food and water to prevent contamination. Clean and inspect regularly. Replace worn items promptly.`;
    },
  },
  
  // AQUARIUM PUMP/AIR
  pump: {
    id: 'pump',
    instructionLabel: 'Setup & Maintenance',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} aquarium pump`,
          'Reliable water circulation or aeration',
          'Quiet operation',
          'Energy efficient',
          'Easy to install and maintain',
        ],
      };
    },
    getInstructions: (p) => {
      return `Install according to included directions. Place air pump above water level or use check valve. Replace air stones and tubing as needed. Clean intake regularly.`;
    },
  },
  
  // REPLACEMENT PARTS/ACCESSORIES
  replacementPart: {
    id: 'replacementPart',
    instructionLabel: 'Installation Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} replacement part`,
          'Fits compatible equipment models',
          'Restores optimal performance',
          'Easy installation',
          'OEM quality',
        ],
      };
    },
    getInstructions: (p) => {
      return `Verify compatibility with your equipment model before purchasing. Follow manufacturer instructions for installation. Unplug electrical equipment before replacing parts.`;
    },
  },
  
  // STAIN & ODOR REMOVERS
  stainRemover: {
    id: 'stainRemover',
    instructionLabel: 'Application Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Effective';
      const nameLower = p.name.toLowerCase();
      const isEnzymatic = nameLower.includes('enzyme') || nameLower.includes('bio');
      const highlights = [`${brand} stain and odor solution`];
      if (isEnzymatic) highlights.push('Enzymatic formula breaks down organic matter');
      highlights.push('Eliminates stains at the source');
      highlights.push('Neutralizes odors completely');
      highlights.push('Safe for use around pets when dry');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Blot excess moisture first. Saturate affected area thoroughly. Allow to sit for 5-10 minutes. Blot or allow to air dry. For tough stains, repeat application. Test in inconspicuous area first.`;
    },
  },
  
  // ODOR ELIMINATORS/AIR FRESHENERS
  odorEliminator: {
    id: 'odorEliminator',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Effective';
      return {
        highlights: [
          `${brand} pet odor eliminator`,
          'Neutralizes odors rather than masking',
          'Long-lasting freshness',
          'Safe for use in pet areas',
          'Pleasant, clean scent',
        ],
      };
    },
    getInstructions: (p) => {
      return `Spray or apply in well-ventilated area. Avoid direct application on pets. Allow treated areas to dry before pet contact. Use as needed for continuous freshness.`;
    },
  },
  
  // ANTLERS & NATURAL CHEWS
  naturalChew: {
    id: 'naturalChew',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Premium';
      const nameLower = p.name.toLowerCase();
      const isAntler = nameLower.includes('antler');
      const isBone = nameLower.includes('bone');
      const highlights = [`${brand} natural chew`];
      if (isAntler) highlights.push('Naturally shed antler - no animals harmed');
      if (isBone) highlights.push('Natural bone provides mineral nutrients');
      highlights.push('Long-lasting for extended chewing satisfaction');
      highlights.push('Supports dental health through natural abrasion');
      highlights.push('No artificial ingredients or preservatives');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Select appropriate size for your dog. Supervise chewing sessions. Remove and discard when small enough to swallow. Replace if sharp edges develop. Not suitable for aggressive power chewers.`;
    },
  },
  
  // SMALL ANIMAL CHEWS/TREATS
  smallAnimalChew: {
    id: 'smallAnimalChew',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      return {
        highlights: [
          `${brand} small animal chew`,
          'Supports dental health through chewing',
          'Made from safe, natural materials',
          'Provides enrichment and entertainment',
          'Helps wear down continuously growing teeth',
        ],
      };
    },
    getInstructions: (p) => {
      return `Place in cage or habitat. Allow pet to chew at their own pace. Replace when heavily worn. Provides important dental enrichment for small animals with continuously growing teeth.`;
    },
  },
  
  // AQUARIUM STARTER KITS
  aquariumKit: {
    id: 'aquariumKit',
    instructionLabel: 'Setup Instructions',
    getFeatures: (p) => {
      const brand = p.brand || 'Quality';
      const nameLower = p.name.toLowerCase();
      const isBetta = nameLower.includes('betta');
      const highlights = [`${brand} aquarium starter kit`];
      if (isBetta) highlights.push('Sized perfectly for betta fish');
      highlights.push('Includes essential equipment to get started');
      highlights.push('Easy setup for beginners');
      highlights.push('Complete system in one package');
      highlights.push('Great introduction to fishkeeping');
      return { highlights };
    },
    getInstructions: (p) => {
      return `Rinse all components (no soap). Assemble per instructions. Fill with dechlorinated water. Allow equipment to run 24 hours before adding fish. Cycle tank properly for best fish health.`;
    },
  },
  
  // GENERIC FALLBACK
  generic: {
    id: 'generic',
    instructionLabel: 'Usage Instructions',
    getFeatures: (p) => {
      const attrs = extractAttributes(p.name);
      const highlights: string[] = [];
      
      // Just state what we can detect from the name, nothing more
      if (p.brand) highlights.push(`By ${p.brand}`);
      if (attrs.size) highlights.push(attrs.size);
      if (attrs.color) highlights.push(attrs.color.charAt(0).toUpperCase() + attrs.color.slice(1));
      
      // Minimal fallback - just the category
      if (highlights.length === 0) {
        highlights.push('Pet accessory');
      }
      
      return { highlights };
    },
    getInstructions: (p) => {
      return `Follow included instructions. Check regularly for wear.`;
    },
  },
};

/**
 * Classify a product into an archetype based on its attributes
 */
export function classifyProduct(product: ProductInfo): ProductArchetype {
  const name = product.name.toLowerCase();
  const category = product.category.toLowerCase();
  const brand = (product.brand || '').toLowerCase();
  const filterType = (product.filterType || '').toLowerCase();
  
  // FOOD CLASSIFICATION
  if (category.includes('food') || category.includes('treats')) {
    // Treats
    if (category.includes('treat') || name.includes('treat') || name.includes('biscuit') || name.includes('jerky')) {
      return archetypes.treats;
    }
    
    // Chews (bones, antlers, etc.)
    if (name.includes('chew') || name.includes('bully') || name.includes('antler') || name.includes('bone') && !name.includes('bonefish')) {
      return archetypes.chews;
    }
    
    // Raw/Freeze-dried
    if (name.includes('raw') || name.includes('freeze-dried') || name.includes('freeze dried') || brand.includes('primal') || brand.includes('vital essential')) {
      return archetypes.rawFood;
    }
    
    // Wet/canned food
    if (name.includes('canned') || name.includes('wet') || name.includes('pate') || name.includes('stew') || name.includes('pouch')) {
      return archetypes.wetPetFood;
    }
    
    // Fish food
    if (filterType === 'aquatic' || name.includes('fish food') || name.includes('flake') || category.includes('aquatic') ||
        name.includes('betta') || name.includes('goldfish') || name.includes('cichlid') || name.includes('tropical fish')) {
      return archetypes.fishFood;
    }
    
    // Reptile food
    if (filterType === 'reptile' || name.includes('reptile') || name.includes('gecko') || name.includes('bearded dragon') ||
        name.includes('turtle food') || name.includes('snake') || name.includes('frog') || name.includes('tadpole')) {
      return archetypes.reptileFood;
    }
    
    // Small animal food
    if (category.includes('smallanimal') || name.includes('guinea pig') || name.includes('hamster') || name.includes('rabbit') ||
        name.includes('gerbil') || name.includes('chinchilla') || name.includes('ferret') || name.includes('mouse') || name.includes('rat food')) {
      return archetypes.smallAnimalFood;
    }
    
    // Default to dry pet food
    return archetypes.dryPetFood;
  }
  
  // GROOMING CLASSIFICATION
  if (category.includes('healthcare') || category.includes('grooming') || category.includes('accessories')) {
    // Conditioner
    if (name.includes('conditioner') || name.includes('conditioning')) {
      return archetypes.conditioner;
    }
    
    // Shampoo
    if (name.includes('shampoo')) {
      return archetypes.shampoo;
    }
    
    // Grooming spray
    if (name.includes('spray') && (name.includes('groom') || name.includes('deodoriz') || name.includes('detangl') || name.includes('fresh'))) {
      return archetypes.groomingSpray;
    }
    
    // Grooming brush
    if (name.includes('brush') || name.includes('comb') || name.includes('rake') || name.includes('furminator') || name.includes('deshed')) {
      return archetypes.groomingBrush;
    }
    
    // Ear care
    if (name.includes('ear')) {
      return archetypes.earCare;
    }
    
    // Dental
    if (name.includes('dental') || name.includes('tooth') || name.includes('teeth')) {
      return archetypes.dental;
    }
    
    // Supplements
    if (name.includes('supplement') || name.includes('vitamin') || name.includes('probiotic') || name.includes('glucosamine') || name.includes('omega')) {
      return archetypes.supplements;
    }
    
    // Flea/Tick
    if (name.includes('flea') || name.includes('tick')) {
      return archetypes.fleaTick;
    }
  }
  
  // ACCESSORIES CLASSIFICATION
  if (category.includes('leash') || category.includes('collar') || category.includes('accessories')) {
    if (name.includes('harness')) {
      return archetypes.harness;
    }
    if (name.includes('leash') || name.includes('lead')) {
      return archetypes.leash;
    }
    if (name.includes('collar')) {
      return archetypes.collar;
    }
  }
  
  // BED CLASSIFICATION
  if (category.includes('bed') || name.includes('bed') || name.includes('mat') || name.includes('crate pad')) {
    return archetypes.bed;
  }
  
  // TOY CLASSIFICATION
  if (category.includes('toy')) {
    if (name.includes('plush') || name.includes('stuffed') || name.includes('squeaky')) {
      return archetypes.plushToy;
    }
    if (name.includes('ball') || name.includes('frisbee') || name.includes('fetch') || name.includes('throw')) {
      return archetypes.fetchToy;
    }
    if (name.includes('puzzle') || name.includes('interactive') || name.includes('treat dispens')) {
      return archetypes.interactiveToy;
    }
    if (name.includes('chew') || name.includes('rope') || name.includes('tug')) {
      return archetypes.chewToy;
    }
    // Default toy
    return archetypes.fetchToy;
  }
  
  // HABITAT CLASSIFICATION (Aquatics/Reptiles)
  if (category.includes('aquatic') || filterType === 'aquatic') {
    if (name.includes('tank') || name.includes('aquarium')) {
      return archetypes.aquarium;
    }
    if (name.includes('filter')) {
      return archetypes.filter;
    }
    if (name.includes('heater')) {
      return archetypes.heater;
    }
    if (name.includes('light') || name.includes('led') || name.includes('lamp')) {
      return archetypes.lighting;
    }
    if (name.includes('gravel') || name.includes('sand') || name.includes('substrate')) {
      return archetypes.substrate;
    }
    if (name.includes('decoration') || name.includes('plant') || name.includes('ornament') || name.includes('rock') || name.includes('wood')) {
      return archetypes.decoration;
    }
  }
  
  if (category.includes('reptile') || filterType === 'reptile') {
    if (name.includes('terrarium') || name.includes('vivarium') || name.includes('tank')) {
      return archetypes.terrarium;
    }
    if (name.includes('heat') || name.includes('heater') || name.includes('heating')) {
      return archetypes.heater;
    }
    if (name.includes('uvb') || name.includes('uv-b') || name.includes('light') || name.includes('bulb') || name.includes('lamp')) {
      return archetypes.lighting;
    }
    if (name.includes('substrate') || name.includes('bedding') || name.includes('bark') || name.includes('moss')) {
      return archetypes.substrate;
    }
    if (name.includes('hide') || name.includes('cave') || name.includes('decoration') || name.includes('branch') || name.includes('vine')) {
      return archetypes.decoration;
    }
  }
  
  // CAGE/HABITAT
  if (category.includes('cage') || name.includes('cage') || name.includes('crate') || name.includes('carrier')) {
    return archetypes.cage;
  }
  
  // LITTER
  if (name.includes('litter') && !name.includes('litter box')) {
    return archetypes.litter;
  }
  
  // WASTE BAGS
  if (name.includes('waste bag') || name.includes('poop bag')) {
    return archetypes.wasteBags;
  }
  
  // SMALL ANIMAL SUPPLIES
  if (category.includes('smallanimal')) {
    if (name.includes('hay') || name.includes('timothy')) {
      return archetypes.smallAnimalFood;
    }
    if (name.includes('bedding') || name.includes('shavings')) {
      return archetypes.substrate;
    }
    if (name.includes('cage') || name.includes('habitat')) {
      return archetypes.cage;
    }
    if (name.includes('toy') || name.includes('wheel') || name.includes('tunnel')) {
      return archetypes.interactiveToy;
    }
    // Small animal accessories (hammocks, cubes, hideouts)
    if (name.includes('hammock') || name.includes('cube') || name.includes('hideout') || name.includes('hide') || name.includes('lounge') || name.includes('cozy')) {
      return archetypes.smallAnimalAccessory;
    }
    return archetypes.smallAnimalAccessory;
  }
  
  // CLOTHING/APPAREL (sweaters, polos, tanktops, coats, jackets, dresses, shirts, pajamas, bandanas)
  if (name.includes('sweater') || name.includes('polo') || name.includes('tanktop') || name.includes('tank top') || 
      name.includes('sweatshirt') || name.includes('hoodie') || name.includes('jacket') || name.includes('coat') && !name.includes('coating') ||
      name.includes('dress') || name.includes('shirt') || name.includes('plaid') || name.includes('camo') || 
      name.includes('stripe') || name.includes('texcable') || name.includes('untucked') || name.includes('pj ') ||
      name.includes('pajama') || name.includes('bandana') || name.includes('doggy bahama') || name.includes('dotswt') ||
      name.includes('moon & stars') || name.includes('accent') || name.includes('costume') || name.includes('outfit')) {
    return archetypes.clothing;
  }
  
  // NAIL/CLAW CARE
  if (name.includes('nail') || name.includes('clipper') || name.includes('trimmer') || name.includes('grinder')) {
    return archetypes.nailCare;
  }
  
  // BOWLS/DISHES
  if (name.includes('bowl') || name.includes('dish') || name.includes('feeder') || name.includes('fountain')) {
    return archetypes.bowl;
  }
  
  // BIRD SUPPLIES
  if (category.includes('bird') || name.includes('perch') || name.includes('cuttlebone') || name.includes('millet')) {
    return archetypes.birdAccessory;
  }
  
  // PUMPS
  if (name.includes('pump') || name.includes('air stone') || name.includes('aerator')) {
    return archetypes.pump;
  }
  
  // REPLACEMENT PARTS
  if (name.includes('replacement') || name.includes('cartridge') || name.includes('refill')) {
    return archetypes.replacementPart;
  }
  
  // DECORATIONS (catch-all for aquarium/habitat decorations not caught earlier)
  if (name.includes('skull') || name.includes('dragon') || name.includes('shark') || name.includes('decor') || 
      name.includes('plant') || name.includes('ornament') || name.includes('statue') || name.includes('figure') ||
      name.includes('castle') || name.includes('rock') || name.includes('bonsai') || name.includes('coral') ||
      name.includes('turtle') || name.includes('bailey') || name.includes('swimming')) {
    return archetypes.decoration;
  }
  
  // STAIN & ODOR REMOVERS
  if (name.includes('stain') || name.includes('odor') || name.includes('remover') || name.includes('eliminator') ||
      name.includes('no more') || name.includes('neutralizer') || name.includes('cleaner')) {
    if (name.includes('stain') || name.includes('remover')) {
      return archetypes.stainRemover;
    }
    return archetypes.odorEliminator;
  }
  
  // PET ODOR PRODUCTS
  if (name.includes('petodor') || name.includes('pet odor') || name.includes('freshener') || name.includes('deodor')) {
    return archetypes.odorEliminator;
  }
  
  // NATURAL CHEWS (antlers, bones for dogs)
  if (name.includes('antler') || (name.includes('bone') && !name.includes('bonefish') && category === 'accessories')) {
    return archetypes.naturalChew;
  }
  
  // SMALL ANIMAL CHEWS (nibbles, calcium chews)
  if (name.includes('nibble') || (name.includes('chew') && name.includes('calcium'))) {
    return archetypes.smallAnimalChew;
  }
  
  // AQUARIUM KITS
  if (name.includes('kit') && (name.includes('betta') || name.includes('aquarium') || category.includes('aquatic'))) {
    return archetypes.aquariumKit;
  }
  
  // DINOSAUR/CHARACTER TOYS
  if (name.includes('dinosaur') || name.includes('dino') || name.includes('dura-fused')) {
    return archetypes.chewToy;
  }
  
  // Default fallback
  return archetypes.generic;
}

/**
 * Generate extended info for a product
 */
export function generateExtendedInfo(product: ProductInfo): {
  features: { highlights: string[] };
  instructions: string;
  instructionLabel: string;
} {
  const archetype = classifyProduct(product);
  
  return {
    features: archetype.getFeatures(product),
    instructions: archetype.getInstructions(product),
    instructionLabel: archetype.instructionLabel,
  };
}
