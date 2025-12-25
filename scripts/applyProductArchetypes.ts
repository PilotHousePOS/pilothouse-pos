/**
 * Apply Product Archetypes Script
 * Regenerates extended info with product-specific content based on archetypes
 * Fixes the issue of generic text being shared across many products
 */

import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { eq, isNull, or, sql } from 'drizzle-orm';
import { classifyProduct, generateExtendedInfo, ProductInfo } from '../server/productArchetypes';

async function applyArchetypes() {
  console.log('🔄 Starting product archetype application...\n');
  
  // Get all active supplies that need regeneration
  // We'll regenerate all products that have the generic text patterns
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    category: supplies.category,
    filterType: supplies.filterType,
    description: supplies.description,
    features: supplies.features,
    instructions: supplies.instructions,
    contentSource: supplies.contentSource,
  })
  .from(supplies)
  .where(eq(supplies.isActive, true));
  
  console.log(`📦 Found ${allSupplies.length} active products\n`);
  
  // Patterns that indicate generic/lazy text that needs to be replaced
  const genericPatterns = [
    'Quality pet products',
    'Safe and reliable design',
    'Easy to use and maintain',
    'Trusted by pet owners',
    'Quality pet product',
    'Safe and durable',
    'Designed for pet comfort',
    'Easy to maintain',
    'Quality materials and construction',
    'Durable nylon construction',
    'Secure hardware and buckles',
    'Comfortable fit for pets',
    'Weather-resistant materials',
    'Professional quality pet products',
    'Trusted by trainers and pet owners',
    'Safe and reliable',
    'Built to last',
  ];
  
  let updated = 0;
  let skipped = 0;
  let manualProtected = 0;
  
  const archetypeCounts: Record<string, number> = {};
  
  for (const supply of allSupplies) {
    // Skip if manually curated (content_source = 'manual')
    if (supply.contentSource === 'manual') {
      manualProtected++;
      skipped++;
      continue;
    }
    
    // Check if current features contain generic patterns
    const currentFeatures = supply.features ? JSON.stringify(supply.features) : '';
    const hasGenericText = genericPatterns.some(pattern => currentFeatures.includes(pattern));
    
    // Only regenerate if:
    // 1. Has generic text patterns, OR
    // 2. No instruction label set yet, OR
    // 3. Features are missing
    const needsRegeneration = hasGenericText || !supply.features;
    
    if (!needsRegeneration) {
      skipped++;
      continue;
    }
    
    // Create product info for classification
    const productInfo: ProductInfo = {
      name: supply.name,
      brand: supply.brand,
      category: supply.category,
      filterType: supply.filterType,
      description: supply.description,
    };
    
    // Generate new extended info using archetype system
    const extendedInfo = generateExtendedInfo(productInfo);
    const archetype = classifyProduct(productInfo);
    
    // Track archetype usage
    archetypeCounts[archetype.id] = (archetypeCounts[archetype.id] || 0) + 1;
    
    // Update the database
    await db.update(supplies)
      .set({
        features: extendedInfo.features,
        instructions: extendedInfo.instructions,
        instructionLabel: extendedInfo.instructionLabel,
        contentSource: 'auto',
        updatedAt: new Date(),
      })
      .where(eq(supplies.id, supply.id));
    
    updated++;
    
    // Progress update every 500 products
    if (updated % 500 === 0) {
      console.log(`   Updated ${updated} products...`);
    }
  }
  
  console.log(`\n✅ Archetype application complete!`);
  console.log(`   Updated: ${updated} products`);
  console.log(`   Skipped: ${skipped} products`);
  console.log(`   Manual protected: ${manualProtected} products`);
  
  console.log(`\n📊 Archetype distribution:`);
  const sortedArchetypes = Object.entries(archetypeCounts)
    .sort(([,a], [,b]) => b - a);
  for (const [archetype, count] of sortedArchetypes) {
    console.log(`   ${archetype}: ${count}`);
  }
  
  // Verify some examples
  console.log(`\n🔍 Sample verifications:`);
  
  // Check a conditioner
  const conditioner = await db.select()
    .from(supplies)
    .where(sql`LOWER(${supplies.name}) LIKE '%conditioner%'`)
    .limit(1);
  if (conditioner.length > 0) {
    console.log(`\n   Conditioner: "${conditioner[0].name}"`);
    console.log(`   Instruction Label: ${conditioner[0].instructionLabel}`);
    console.log(`   Features: ${JSON.stringify(conditioner[0].features)?.substring(0, 100)}...`);
  }
  
  // Check a food product
  const food = await db.select()
    .from(supplies)
    .where(sql`LOWER(${supplies.name}) LIKE '%food%' AND ${supplies.category} LIKE '%food%'`)
    .limit(1);
  if (food.length > 0) {
    console.log(`\n   Food: "${food[0].name}"`);
    console.log(`   Instruction Label: ${food[0].instructionLabel}`);
    console.log(`   Features: ${JSON.stringify(food[0].features)?.substring(0, 100)}...`);
  }
  
  // Check a leash
  const leash = await db.select()
    .from(supplies)
    .where(sql`LOWER(${supplies.name}) LIKE '%leash%'`)
    .limit(1);
  if (leash.length > 0) {
    console.log(`\n   Leash: "${leash[0].name}"`);
    console.log(`   Instruction Label: ${leash[0].instructionLabel}`);
    console.log(`   Features: ${JSON.stringify(leash[0].features)?.substring(0, 100)}...`);
  }
}

applyArchetypes()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
