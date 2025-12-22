import fs from 'fs';
import { db } from '../server/db.js';
import { supplies } from '../shared/schema.js';
import { sql, eq } from 'drizzle-orm';

// Central Pet Oxbow products extracted from invoices (cleaned names)
const centralPetOxbow = [
  { upc: '744845302096', name: 'Oxbow Food Essential Hamster/Gerbil 1lb' },
  { upc: '744845302102', name: 'Oxbow Food Essential Chinchilla 3lb' },
  { upc: '744845402291', name: 'Oxbow Western Timothy Hay 90oz' },
  { upc: '744845402819', name: 'Oxbow Food Essential Young Guinea Pig 10lb' },
  { upc: '744845403113', name: 'Oxbow Timothy Club Hideaway Tunnel' },
  { upc: '744845403137', name: 'Oxbow Timothy Club Bungalow Medium' },
  { upc: '744845810072', name: 'Oxbow Timothy Orchard Hay 90oz' },
  { upc: '744845960173', name: 'Oxbow Simple Rewards Baked Carrot & Dill 3oz' },
  { upc: '744845960234', name: 'Oxbow Simple Rewards Baked Apple & Banana 3oz' },
  { upc: '744845963785', name: 'Oxbow Dripless Water Bottle 15oz' },
  { upc: '744845966427', name: 'Oxbow Rectangle Litter Pan with Shield' },
  { upc: '744845967912', name: 'Oxbow Timothy Hut Small Animal Medium' },
  { upc: '744845968339', name: 'Oxbow Food Essential Ferret 4lb' },
  { upc: '744845110028', name: 'Oxbow Bedding Pure Comfort 36L' },
  { upc: '744845111025', name: 'Oxbow Bedding Pure Comfort 72L' },
  { upc: '744845402451', name: 'Oxbow Food Essential Young Rabbit 5lb' },
  { upc: '744845402550', name: 'Oxbow Food Essential Young Rabbit 10lb' },
  { upc: '744845402895', name: 'Oxbow Food Essential Adult Rabbit 10lb' },
  { upc: '744845402901', name: 'Oxbow Food Essential Adult Guinea Pig 5lb' },
  { upc: '744845402963', name: 'Oxbow Orchard Grass Hay 40oz' },
  { upc: '744845965291', name: 'Oxbow Toy Celebration Cupcake' },
  { upc: '744845966731', name: 'Oxbow Toy Willow Play Cube' },
  { upc: '744845966847', name: 'Oxbow Toy Timothy Waffle' },
  { upc: '744845969831', name: 'Oxbow Western Timothy/Orchard Hay 15oz' },
  { upc: '744845402864', name: 'Oxbow Food Essential Adult Rabbit 25lb' },
  { upc: '744845403168', name: 'Oxbow Timothy Mat Large' },
  { upc: '744845963150', name: 'Oxbow Toy Apple Stick Dangly' },
  { upc: '744845402758', name: 'Oxbow Western Timothy Hay 40oz' },
  { upc: '744845402888', name: 'Oxbow Food Essential Adult Rabbit 5lb' },
  { upc: '744845402918', name: 'Oxbow Food Essential Adult Guinea Pig 10lb' },
  { upc: '744845963631', name: 'Oxbow Food Garden Mouse/Rat 2lb' },
  { upc: '744845105024', name: 'Oxbow Bedding Pure Comfort White 36L' },
  { upc: '744845108025', name: 'Oxbow Bedding Pure Comfort Natural 56L' },
  { upc: '744845402253', name: 'Oxbow Western Timothy Hay 15oz' },
  { upc: '744845402727', name: 'Oxbow Food Essential Chinchilla 10lb' },
  { upc: '744845404011', name: 'Oxbow Food Essential Adult Rat 3lb' },
  { upc: '744845404042', name: 'Oxbow Food Essential Mouse/Young Rat 2.5lb' },
  { upc: '744845405001', name: 'Oxbow Botanical Hay 15oz' },
  { upc: '744845965475', name: 'Oxbow Toy Timothy Hide & Seek Mat Small' },
  { upc: '744845403199', name: 'Oxbow Timothy Twists' },
  { upc: '744845963273', name: 'Oxbow Toy Crazy Hay Ball' },
  { upc: '744845963365', name: 'Oxbow Toy Roll Arounds' },
  { upc: '744845402802', name: 'Oxbow Food Essential Young Guinea Pig 5lb' },
  { upc: '744845963518', name: 'Oxbow Cage Habitat with Play Yard XL' },
];

// Create mapping from product keywords to UPCs
function normalizeForMatch(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('=== MATCHING OXBOW SUPPLIES WITH CENTRAL PET UPCs ===\n');
  
  // Get all Oxbow supplies without UPC
  const oxbowSupplies = await db.select()
    .from(supplies)
    .where(sql`${supplies.brand} = 'Oxbow' AND ${supplies.upc} IS NULL`);
  
  console.log(`Found ${oxbowSupplies.length} unmatched Oxbow supplies`);
  
  // Create index for Central Pet products
  const cpIndex = centralPetOxbow.map(p => ({
    ...p,
    normalized: normalizeForMatch(p.name),
    tokens: normalizeForMatch(p.name).split(' ').filter(t => t.length > 2)
  }));
  
  const matches = [];
  
  for (const supply of oxbowSupplies) {
    const supplyNorm = normalizeForMatch(supply.name);
    const supplyTokens = supplyNorm.split(' ').filter(t => t.length > 2);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const cp of cpIndex) {
      // Count matching tokens
      const matchingTokens = supplyTokens.filter(t => cp.tokens.includes(t) || cp.normalized.includes(t));
      const score = matchingTokens.length / Math.max(supplyTokens.length, 1);
      
      // Weight by specific keywords
      let bonus = 0;
      if (supplyNorm.includes('chinch') && cp.normalized.includes('chinch')) bonus += 0.3;
      if (supplyNorm.includes('rabbit') && cp.normalized.includes('rabbit')) bonus += 0.3;
      if (supplyNorm.includes('gpig') && cp.normalized.includes('guinea')) bonus += 0.3;
      if (supplyNorm.includes('ferret') && cp.normalized.includes('ferret')) bonus += 0.3;
      if (supplyNorm.includes('rat') && cp.normalized.includes('rat')) bonus += 0.3;
      if (supplyNorm.includes('litter') && cp.normalized.includes('litter')) bonus += 0.3;
      if (supplyNorm.includes('bungalow') && cp.normalized.includes('bungalow')) bonus += 0.3;
      if (supplyNorm.includes('tunnel') && cp.normalized.includes('tunnel')) bonus += 0.3;
      if (supplyNorm.includes('bottle') && cp.normalized.includes('bottle')) bonus += 0.3;
      if (supplyNorm.includes('mat') && cp.normalized.includes('mat')) bonus += 0.3;
      if (supplyNorm.includes('waffle') && cp.normalized.includes('waffle')) bonus += 0.3;
      if (supplyNorm.includes('cube') && cp.normalized.includes('cube')) bonus += 0.3;
      
      // Size matching
      const sizeMatch = (s, c) => {
        const sizes = ['3lb', '5lb', '10lb', '15oz', '40oz', '90oz', '36l', '72l'];
        for (const size of sizes) {
          if (s.includes(size.replace('lb', '')) && c.includes(size)) return true;
        }
        return false;
      };
      if (sizeMatch(supplyNorm, cp.normalized)) bonus += 0.2;
      
      const totalScore = score + bonus;
      
      if (totalScore > bestScore && totalScore >= 0.4) {
        bestScore = totalScore;
        bestMatch = cp;
      }
    }
    
    if (bestMatch) {
      matches.push({
        supplyId: supply.id,
        supplyName: supply.name,
        matchedName: bestMatch.name,
        upc: bestMatch.upc,
        score: bestScore
      });
    }
  }
  
  console.log(`\nFound ${matches.length} matches:`);
  matches.forEach(m => {
    console.log(`  ${m.supplyName} -> ${m.matchedName} (${m.upc}) [${(m.score*100).toFixed(0)}%]`);
  });
  
  // Apply matches to database
  if (matches.length > 0) {
    console.log('\nApplying matches to database...');
    for (const m of matches) {
      await db.update(supplies)
        .set({ upc: m.upc })
        .where(eq(supplies.id, m.supplyId));
    }
    console.log(`Updated ${matches.length} Oxbow supplies with UPCs`);
  }
  
  // Check final count
  const finalCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(supplies)
    .where(sql`${supplies.brand} = 'Oxbow' AND ${supplies.upc} IS NOT NULL`);
  
  console.log(`\nOxbow supplies with UPC: ${finalCount[0].count} / 88`);
  
  process.exit(0);
}

main().catch(console.error);
