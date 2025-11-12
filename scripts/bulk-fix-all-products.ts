import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { abbreviationMappings, spellingCorrections, lowercaseWords, uppercaseBrands } from './shared-mappings';
import { sql } from 'drizzle-orm';

// Phase 1: Expand abbreviations
function expandAbbreviations(text: string): string {
  let expanded = text;
  for (const [abbrev, full] of Object.entries(abbreviationMappings)) {
    if (abbrev === '#') {
      expanded = expanded.replace(/#(?=\s|$)/g, full);
    } else {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      expanded = expanded.replace(regex, full);
    }
  }
  return expanded;
}

// Phase 2: Fix spelling errors
function correctSpelling(text: string): string {
  let corrected = text;
  for (const [wrong, right] of Object.entries(spellingCorrections)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    corrected = corrected.replace(regex, right);
  }
  return corrected;
}

// Phase 3: Apply title case
function applyTitleCase(text: string): string {
  const capitalizeWord = (word: string, isFirstWord: boolean): string => {
    if (!word) return word;
    const upperWord = word.toUpperCase();
    const lowerWord = word.toLowerCase();
    if (uppercaseBrands.includes(upperWord)) return upperWord;
    if (isFirstWord) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    if (lowercaseWords.includes(lowerWord)) return lowerWord;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  };
  
  return text.split(' ').map((segment, spaceIndex) => {
    if (segment.includes('/')) {
      return segment.split('/').map((part, slashIndex) => 
        capitalizeWord(part, spaceIndex === 0 && slashIndex === 0)
      ).join('/');
    } else if (segment.includes(',')) {
      return segment.split(',').map((part, commaIndex) => 
        capitalizeWord(part, spaceIndex === 0 && commaIndex === 0)
      ).join(',');
    } else {
      return capitalizeWord(segment, spaceIndex === 0);
    }
  }).join(' ');
}

// Process text through all phases
function processText(text: string): string {
  return applyTitleCase(correctSpelling(expandAbbreviations(text)));
}

async function main() {
  console.log('🚀 BULK PRODUCT FORMATTING FIX\n');
  console.log('Loading all supplies...');
  
  const allSupplies = await db.select().from(supplies);
  console.log(`📊 Total products: ${allSupplies.length}\n`);
  
  console.log('🔄 Processing transformations...');
  const updates: any[] = [];
  
  for (const supply of allSupplies) {
    const newName = processText(supply.name);
    const newDescription = supply.description ? processText(supply.description) : supply.description;
    
    if (newName !== supply.name || newDescription !== supply.description) {
      updates.push({
        id: supply.id,
        name: newName,
        description: newDescription,
        updatedAt: new Date()
      });
    }
  }
  
  console.log(`📝 Found ${updates.length} products needing updates\n`);
  
  if (updates.length === 0) {
    console.log('✅ All products are already correctly formatted!');
    process.exit(0);
  }
  
  console.log('💾 Applying bulk updates in chunks of 500...');
  const CHUNK_SIZE = 500;
  let processed = 0;
  
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    
    await db.transaction(async (tx) => {
      for (const update of chunk) {
        await tx.update(supplies)
          .set({ name: update.name, description: update.description, updatedAt: update.updatedAt })
          .where(sql`${supplies.id} = ${update.id}`);
      }
    });
    
    processed += chunk.length;
    console.log(`✓ Processed ${processed}/${updates.length} products...`);
  }
  
  console.log(`\n✅ Successfully updated ${updates.length} products!`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
