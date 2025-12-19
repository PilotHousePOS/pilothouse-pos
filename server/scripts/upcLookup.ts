import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, isNull, or, sql, ilike } from 'drizzle-orm';

// Hill's Science Diet UPC database (from upcitemdb.com)
const HILLS_UPC_DB: Record<string, string> = {
  // Puppy Small Breed
  '052742909400': 'Science Diet Puppy Small Paws Chicken 4.5lb',
  '052742909608': 'Science Diet Puppy Small Paws Chicken 12.5lb',
  
  // Adult Small Breed
  '052742909707': 'Science Diet Adult Small Paws Chicken 4.5lb',
  '052742909806': 'Science Diet Adult Small Paws Chicken 15.5lb',
  
  // Small Breed Lamb
  '052742289601': 'Science Diet Adult Small Breed Lamb 4.5lb',
  '052742289700': 'Science Diet Adult Small Breed Lamb 15.5lb',
  
  // Small Breed Light
  '052742910000': 'Science Diet Adult Small Breed Light 4.5lb',
  '052742910109': 'Science Diet Adult Small Breed Light 15.5lb',
  
  // Small Breed 7+
  '052742909806': 'Science Diet Adult 7+ Small Paws 4.5lb',
  
  // Small Breed 11+
  '052742253305': 'Science Diet Adult 11+ Small Paws 4.5lb',
  '052742253404': 'Science Diet Adult 11+ Small Paws 15.5lb',
  
  // Large Breed Puppy
  '052742937601': 'Science Diet Puppy Large Breed 15.5lb',
  '052742060194': 'Science Diet Puppy Large Breed Chicken 27.5lb',
  '052742060170': 'Science Diet Puppy Large Breed Lamb 30lb',
  
  // Large Breed Adult
  '052742020402': 'Science Diet Adult Large Breed Chicken 15lb',
  '052742886206': 'Science Diet Adult Large Breed Chicken 17.5lb',
  '052742204208': 'Science Diet Adult Large Breed Chicken 33lb',
  
  // Large Breed 6+
  '052742060779': 'Science Diet Adult 6+ Large Breed 15lb',
  '052742060680': 'Science Diet Adult 6+ Large Breed 33lb',
  
  // Light products
  '052742203904': 'Science Diet Adult Light 33lb',
  '052742886602': 'Science Diet Adult Light 17.5lb',
  '052742204000': 'Science Diet Adult Light Small Bites 33lb',
  '052742892306': 'Science Diet Adult Light Small Bites 17.5lb',
  
  // Perfect Weight
  '052742297507': 'Science Diet Perfect Weight 12.8oz Can',
  
  // Sensitive Stomach
  '052742306100': 'Science Diet Sensitive Stomach Skin 4lb',
  '052742306209': 'Science Diet Sensitive Stomach Skin 15.5lb',
  '052742306308': 'Science Diet Sensitive Stomach Skin 30lb',
  
  // Cat products
  '052742854205': 'Science Diet Adult Light Cat 17.5lb',
  '052742617312': 'Science Diet Kitten Salmon 5.5oz Can',
  '052742661117': 'Science Diet Adult Optimal Care Beef 5.5oz Can',
  '052742610801': 'Science Diet Indoor Cat Chicken 5.5oz Can',
  '052742071614': 'Science Diet Cat Hairball Control 7+ 3.5lb',
  
  // Grain Free
  '052742253206': 'Science Diet Adult Grain Free 21lb',
};

// Normalize product name for matching
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/hill's?/gi, '')
    .replace(/science\s*diet/gi, '')
    .replace(/[™®©\-'"&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract key features from product name
function extractFeatures(name: string): {
  lifestage?: string;
  breed?: string;
  protein?: string;
  weight?: string;
  type?: string;
} {
  const lower = name.toLowerCase();
  
  const features: any = {};
  
  // Life stage
  if (lower.includes('puppy') || lower.includes('pup')) features.lifestage = 'puppy';
  else if (lower.includes('kitten') || lower.includes('kit')) features.lifestage = 'kitten';
  else if (lower.includes('11+')) features.lifestage = 'senior11';
  else if (lower.includes('7+') || lower.includes('mature')) features.lifestage = 'mature7';
  else if (lower.includes('6+')) features.lifestage = 'mature6';
  else if (lower.includes('senior')) features.lifestage = 'senior';
  else if (lower.includes('adult')) features.lifestage = 'adult';
  
  // Breed size
  if (lower.includes('small') || lower.includes('sm br') || lower.includes('small paws') || lower.includes('mini')) {
    features.breed = 'small';
  } else if (lower.includes('large') || lower.includes('lg br')) {
    features.breed = 'large';
  }
  
  // Protein
  if (lower.includes('chicken') || lower.includes(' ck ') || lower.match(/\bck\b/)) {
    features.protein = 'chicken';
  } else if (lower.includes('lamb') || lower.includes(' lam ') || lower.match(/\blam\b/)) {
    features.protein = 'lamb';
  } else if (lower.includes('salmon') || lower.includes(' sal ')) {
    features.protein = 'salmon';
  } else if (lower.includes('beef')) {
    features.protein = 'beef';
  }
  
  // Product type
  if (lower.includes('light') || lower.includes('lite')) features.type = 'light';
  else if (lower.includes('sensitive') || lower.includes('sensi')) features.type = 'sensitive';
  else if (lower.includes('perfect weight')) features.type = 'perfectweight';
  else if (lower.includes('hairball')) features.type = 'hairball';
  else if (lower.includes('indoor')) features.type = 'indoor';
  else if (lower.includes('grain free') || lower.includes('gr fr')) features.type = 'grainfree';
  
  // Weight
  const weightMatch = lower.match(/(\d+\.?\d*)\s*(lb|oz|#|pound)/);
  if (weightMatch) {
    features.weight = weightMatch[1] + (weightMatch[2] === 'oz' ? 'oz' : 'lb');
  }
  
  return features;
}

// Match product to UPC
function findUpcMatch(supplyName: string): string | null {
  const supFeatures = extractFeatures(supplyName);
  
  let bestMatch: { upc: string; score: number } = { upc: '', score: 0 };
  
  for (const [upc, dbName] of Object.entries(HILLS_UPC_DB)) {
    const dbFeatures = extractFeatures(dbName);
    
    let score = 0;
    let requiredMatches = 0;
    let matchedRequired = 0;
    
    // Life stage match (required)
    if (supFeatures.lifestage) {
      requiredMatches++;
      if (supFeatures.lifestage === dbFeatures.lifestage) {
        score += 25;
        matchedRequired++;
      }
    }
    
    // Breed match (required for breed-specific products)
    if (supFeatures.breed) {
      requiredMatches++;
      if (supFeatures.breed === dbFeatures.breed) {
        score += 25;
        matchedRequired++;
      }
    }
    
    // Protein match
    if (supFeatures.protein && dbFeatures.protein) {
      if (supFeatures.protein === dbFeatures.protein) {
        score += 20;
      }
    } else if (!supFeatures.protein && !dbFeatures.protein) {
      score += 10; // Both don't specify protein
    }
    
    // Type match (light, sensitive, etc.)
    if (supFeatures.type && dbFeatures.type) {
      requiredMatches++;
      if (supFeatures.type === dbFeatures.type) {
        score += 20;
        matchedRequired++;
      }
    } else if (!supFeatures.type && !dbFeatures.type) {
      score += 5;
    }
    
    // Weight match (important but not always required)
    if (supFeatures.weight && dbFeatures.weight) {
      if (supFeatures.weight === dbFeatures.weight) {
        score += 15;
      }
    }
    
    // Must match all required features
    if (requiredMatches > 0 && matchedRequired < requiredMatches) {
      continue;
    }
    
    if (score > bestMatch.score) {
      bestMatch = { upc, score };
    }
  }
  
  return bestMatch.score >= 50 ? bestMatch.upc : null;
}

async function run() {
  console.log('=== UPC Lookup for Science Diet Products ===\n');
  
  // Get unmatched Science Diet products
  const unmatched = await db.select({ id: supplies.id, name: supplies.name })
    .from(supplies)
    .where(sql`(sku IS NULL OR sku = '') AND name ILIKE '%science diet%'`);
  
  console.log(`Found ${unmatched.length} unmatched Science Diet products\n`);
  
  // Get already-used UPCs
  const existing = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const usedUpcs = new Set(existing.map(s => s.sku!));
  
  let matchCount = 0;
  const matches: string[] = [];
  const noMatches: string[] = [];
  
  for (const supply of unmatched) {
    const upc = findUpcMatch(supply.name);
    
    if (upc && !usedUpcs.has(upc)) {
      await db.update(supplies)
        .set({ sku: upc })
        .where(eq(supplies.id, supply.id));
      
      usedUpcs.add(upc);
      matchCount++;
      matches.push(`"${supply.name}" -> ${upc} (${HILLS_UPC_DB[upc]})`);
    } else {
      noMatches.push(supply.name);
    }
  }
  
  console.log('=== Matches ===');
  for (const m of matches) {
    console.log(m);
  }
  
  console.log(`\n=== No Match Found (${noMatches.length}) ===`);
  for (const nm of noMatches.slice(0, 20)) {
    console.log(`- ${nm}`);
  }
  
  // Final stats
  const final = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const total = 7603;
  const coverage = (Number(final[0].count) / total * 100).toFixed(1);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`New matches: ${matchCount}`);
  console.log(`Total with SKU: ${final[0].count}/${total} (${coverage}%)`);
}

run().catch(console.error);
