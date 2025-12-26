import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Extended info templates by product type
const templates = {
  // Reptile food
  reptileFood: {
    features: { highlights: ["Nutritionally balanced formula", "Supports healthy growth", "Made with natural ingredients", "Easy to digest"] },
    instructions: "Feed appropriate amount based on your pet's size. Remove uneaten food after 24 hours. Store in a cool, dry place.",
    materials: "See ingredients list for full nutritional information"
  },
  
  // Reptile dishes/bowls
  reptileDish: {
    features: { highlights: ["Natural rock appearance", "Non-porous surface for easy cleaning", "Stable design prevents tipping", "Safe for all reptiles"] },
    instructions: "Clean regularly with warm water. Replace water daily. Ensure proper placement in habitat for easy access.",
    materials: "Durable resin construction with food-safe finish"
  },
  
  // Reptile caves/hides
  reptileCave: {
    features: { highlights: ["Natural appearance blends with habitat", "Provides secure hiding spot", "Helps reduce stress", "Easy to clean"] },
    instructions: "Place in habitat to provide a secure hiding area. Clean periodically with warm water. Ensure proper ventilation.",
    materials: "Durable resin or natural materials"
  },
  
  // Reptile lighting/heating
  reptileLighting: {
    features: { highlights: ["Provides essential UVB lighting", "Promotes natural behavior", "Helps calcium absorption", "Energy efficient design"] },
    instructions: "Install according to manufacturer guidelines. Replace bulbs as recommended. Monitor temperature with thermometer.",
    materials: "High-quality lighting components with safety features"
  },
  
  // Thermometers/gauges
  gauge: {
    features: { highlights: ["Accurate temperature/humidity readings", "Easy to read display", "Reliable monitoring", "Essential for habitat management"] },
    instructions: "Mount in habitat at appropriate height. Check readings regularly. Replace batteries as needed.",
    materials: "Durable plastic housing with precision sensors"
  },
  
  // Reptile decor/vines
  reptileDecor: {
    features: { highlights: ["Natural appearance", "Provides climbing opportunities", "Enhances habitat enrichment", "Safe for all reptiles"] },
    instructions: "Secure in habitat using provided hardware. Clean periodically. Inspect for wear regularly.",
    materials: "Safe, non-toxic materials designed for reptile habitats"
  },
  
  // Dog toys
  dogToy: {
    features: { highlights: ["Durable construction", "Promotes active play", "Satisfies natural instincts", "Veterinarian recommended"] },
    instructions: "Supervise play sessions. Inspect regularly for damage. Replace if worn or damaged. Not a chew toy.",
    materials: "Durable rubber/nylon construction"
  },
  
  // Dog treats/feeders
  dogTreat: {
    features: { highlights: ["Mental stimulation", "Encourages problem solving", "Slows eating pace", "Veterinarian recommended"] },
    instructions: "Fill with treats or food. Supervise use. Clean after each use. Dishwasher safe.",
    materials: "Food-safe, BPA-free materials"
  },
  
  // Small animal supplies
  smallAnimal: {
    features: { highlights: ["Designed for small pets", "Safe materials", "Promotes natural behavior", "Easy to clean"] },
    instructions: "Place in habitat. Clean regularly. Inspect for wear. Replace if damaged.",
    materials: "Pet-safe materials with non-toxic finish"
  },
  
  // Small animal exercise
  smallAnimalExercise: {
    features: { highlights: ["Promotes healthy exercise", "Quiet operation", "Safe enclosed design", "Easy to clean"] },
    instructions: "Supervise use outside of cage. Clean regularly. Ensure proper ventilation. Size appropriately for your pet.",
    materials: "Durable plastic construction with ventilation slots"
  },
  
  // Aquatic fish
  fish: {
    features: { highlights: ["Captive bred for health", "Vibrant coloration", "Peaceful community fish", "Easy to care for"] },
    instructions: "Acclimate slowly to new tank. Maintain proper water parameters. Feed appropriate diet. Monitor for signs of stress.",
    materials: "Live fish - handle with care"
  },
  
  // Water conditioners
  waterConditioner: {
    features: { highlights: ["Removes harmful chemicals", "Safe for aquatic life", "Fast acting formula", "Essential for water changes"] },
    instructions: "Add recommended amount during water changes. Follow dosage instructions. Store in cool, dry place.",
    materials: "Aquatic-safe water treatment formula"
  },
  
  // Cat toys
  catToy: {
    features: { highlights: ["Stimulates natural hunting instincts", "Promotes active play", "Durable construction", "Safe materials"] },
    instructions: "Supervise play. Inspect regularly for damage. Replace if worn. Store safely when not in use.",
    materials: "Pet-safe materials with non-toxic components"
  },
  
  // Healthcare
  healthcare: {
    features: { highlights: ["Effective formula", "Safe for pets", "Easy to use", "Fast acting"] },
    instructions: "Follow label directions. Keep out of reach of children. Store as directed. Consult veterinarian if needed.",
    materials: "See product label for ingredients"
  },
  
  // Hermit crab supplies
  hermitCrab: {
    features: { highlights: ["Essential for hermit crab health", "Natural formulation", "Promotes shell health", "Easy to use"] },
    instructions: "Use as directed. Maintain proper humidity. Replace as needed. Keep habitat clean.",
    materials: "Natural, crab-safe ingredients"
  },
  
  // Turtle supplies
  turtle: {
    features: { highlights: ["Designed for aquatic turtles", "Promotes shell health", "Natural appearance", "Easy to clean"] },
    instructions: "Place in habitat. Clean regularly. Maintain proper water quality. Monitor turtle health.",
    materials: "Turtle-safe, aquatic-grade materials"
  }
};

// Map products to templates
function getTemplate(product) {
  const name = product.name.toLowerCase();
  const brand = (product.brand || '').toLowerCase();
  const category = product.category || '';
  
  // Food products
  if (name.includes('food') || name.includes('sticks') || name.includes('banquet') || name.includes('repto min') || name.includes('shrimp')) {
    return templates.reptileFood;
  }
  
  // Dishes/bowls
  if (name.includes('dish') || name.includes('bowl') || name.includes('water') || name.includes('ramp')) {
    if (category === 'reptiles') return templates.reptileDish;
    return templates.turtle;
  }
  
  // Caves/hides
  if (name.includes('cave') || name.includes('den') || name.includes('hide') || name.includes('hotel') || name.includes('mushroom')) {
    return templates.reptileCave;
  }
  
  // Lighting
  if (name.includes('uvb') || name.includes('lighting') || name.includes('hood') || name.includes('combo') && name.includes('desert')) {
    return templates.reptileLighting;
  }
  
  // Gauges
  if (name.includes('thermometer') || name.includes('hygrometer') || name.includes('combometer') || name.includes('timer') || name.includes('gauge')) {
    return templates.gauge;
  }
  
  // Decor/vines
  if (name.includes('vine') || name.includes('bridge') || name.includes('jungle')) {
    return templates.reptileDecor;
  }
  
  // Turtle specific
  if (name.includes('turtle') || name.includes('lagoon')) {
    return templates.turtle;
  }
  
  // Hermit crab
  if (name.includes('hermit')) {
    return templates.hermitCrab;
  }
  
  // Dog toys (Kong)
  if (brand === 'kong' && (category === 'toys' || name.includes('ball') || name.includes('bumper') || name.includes('tug'))) {
    return templates.dogToy;
  }
  
  // Dog treats/feeders
  if (brand === 'kong' && (category === 'dogTreats' || name.includes('spinner') || name.includes('treat'))) {
    return templates.dogTreat;
  }
  
  // Small animal exercise
  if (name.includes('roller') || name.includes('ball') && category === 'smallAnimalSupplies') {
    return templates.smallAnimalExercise;
  }
  
  // Small animal
  if (category === 'smallAnimalSupplies') {
    return templates.smallAnimal;
  }
  
  // Fish/aquatics
  if (category === 'aquatics' && (name.includes('angel') || name.includes('fish') || name.includes('snail') || name.includes('polypterus') || name.includes('otocinclus'))) {
    return templates.fish;
  }
  
  // Water conditioner
  if (name.includes('conditioner')) {
    return templates.waterConditioner;
  }
  
  // Cat toys
  if (category === 'catToys' || name.includes('cat')) {
    return templates.catToy;
  }
  
  // Healthcare
  if (category === 'healthcare' || name.includes('skunk')) {
    return templates.healthcare;
  }
  
  // Default
  return templates.smallAnimal;
}

async function addExtendedInfo() {
  // Get products missing extended info
  const { rows: products } = await pool.query(`
    SELECT id, name, brand, category
    FROM supplies 
    WHERE features IS NULL OR instructions IS NULL OR instructions = ''
  `);
  
  console.log(`Adding extended info to ${products.length} products...\n`);
  
  let updated = 0;
  for (const product of products) {
    const template = getTemplate(product);
    
    await pool.query(`
      UPDATE supplies 
      SET features = $1, 
          instructions = $2,
          materials = COALESCE(materials, $3)
      WHERE id = $4
    `, [
      JSON.stringify(template.features),
      template.instructions,
      template.materials,
      product.id
    ]);
    
    console.log(`✓ ${product.id}: ${product.name}`);
    updated++;
  }
  
  console.log(`\n=== Updated ${updated} products ===`);
  await pool.end();
}

addExtendedInfo().catch(console.error);
