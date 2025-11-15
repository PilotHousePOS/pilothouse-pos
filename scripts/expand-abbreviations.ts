import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function expandAbbreviations() {
  console.log('Expanding abbreviations in product names and descriptions...\n');
  
  // Define abbreviation mappings
  const abbreviations = [
    // Brand abbreviations
    { pattern: /\bWholseso\b/gi, replacement: 'Wholesome' },
    { pattern: /\bWholso\b/gi, replacement: 'Wholesome' },
    { pattern: /\bWholeso\b/gi, replacement: 'Wholesome' },
    { pattern: /\bSensi\b/gi, replacement: 'Sensitive' },
    { pattern: /\bVict\b/gi, replacement: 'Victor' },
    { pattern: /\bEuk\b/gi, replacement: 'Eukanuba' },
    { pattern: /\bNutri Sour\b/gi, replacement: 'Nutrisource' },
    { pattern: /\bNutri Sou\b/gi, replacement: 'Nutrisource' },
    { pattern: /\bBlue B\b/gi, replacement: 'Blue Buffalo' },
    { pattern: /\bRed B\b/gi, replacement: 'RedBarn' },
    { pattern: /\bZign\b/gi, replacement: 'Zignature' },
    
    // Multi-word phrases (must come before single words)
    { pattern: /\bFromm Gold Weight\b(?! Management)/gi, replacement: 'Fromm Gold Weight Management' },
    { pattern: /\bPerf Weight\b/gi, replacement: 'Perfect Weight' },
    { pattern: /\bMini Chu\b/gi, replacement: 'Minniechuncks' },
    { pattern: /\bGr Fr\b/gi, replacement: 'Grain Free' },
    { pattern: /\bConure&tiel\b/gi, replacement: 'Conure & Cockatiel' },
    { pattern: /\bClmbree\b/gi, replacement: 'Calm Breeze' },
    { pattern: /\bBbypdr\b/gi, replacement: 'Baby powder' },
    { pattern: /\bWorldsbestcatlitter\b/gi, replacement: "World's Best Cat Litter" },
    
    // Single word abbreviations
    { pattern: /\bSportmix\b/gi, replacement: 'Sportsmix' },
    { pattern: /\bOrig\b/gi, replacement: 'Original' },
    { pattern: /\bCast\b/gi, replacement: 'Cat' },
    { pattern: /\bPer\b/gi, replacement: 'Perfect' },
    { pattern: /\bInd\b/gi, replacement: 'Indoor' },
    { pattern: /\bShred\b/gi, replacement: 'Shredded' },
    { pattern: /\bSeaf\b/gi, replacement: 'Seafood' },
    { pattern: /\bUnsc\./gi, replacement: 'Unscented' },
    { pattern: /\bKanga\b/gi, replacement: 'Kangaroo' },
    { pattern: /\bZssen\b/gi, replacement: 'Zssential' },
    { pattern: /\bYurkey\b/gi, replacement: 'Turkey' },
    { pattern: /\bBlk\b/gi, replacement: 'Black' },
    { pattern: /\bYng\b/gi, replacement: 'Young' },
    { pattern: /\bGpig\b/gi, replacement: 'Guineapig' },
    { pattern: /\bSpe\b/gi, replacement: 'Special' },
    { pattern: /\bSpec\b/gi, replacement: 'Special' },
  ];
  
  // Get all supplies
  const allSupplies = await db.select().from(supplies);
  console.log(`Processing ${allSupplies.length} products...\n`);
  
  let updatedCount = 0;
  const changes: Array<{ id: number; oldName: string; newName: string }> = [];
  
  for (const supply of allSupplies) {
    let nameChanged = false;
    let descChanged = false;
    let newName = supply.name;
    let newDesc = supply.description || '';
    
    // Apply all abbreviation replacements to name
    for (const { pattern, replacement } of abbreviations) {
      if (pattern.test(newName)) {
        newName = newName.replace(pattern, replacement);
        nameChanged = true;
      }
      if (pattern.test(newDesc)) {
        newDesc = newDesc.replace(pattern, replacement);
        descChanged = true;
      }
    }
    
    // Update if changed
    if (nameChanged || descChanged) {
      const updateData: any = {};
      if (nameChanged) updateData.name = newName;
      if (descChanged) updateData.description = newDesc;
      
      await db.update(supplies)
        .set(updateData)
        .where(sql`${supplies.id} = ${supply.id}`);
      
      updatedCount++;
      
      if (nameChanged) {
        changes.push({
          id: supply.id,
          oldName: supply.name,
          newName: newName
        });
      }
      
      if (updatedCount % 50 === 0) {
        console.log(`Updated ${updatedCount} products...`);
      }
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total products updated: ${updatedCount}`);
  
  // Show sample changes
  if (changes.length > 0) {
    console.log('\n=== Sample Changes (first 10) ===');
    changes.slice(0, 10).forEach(change => {
      console.log(`  ${change.oldName}`);
      console.log(`  → ${change.newName}\n`);
    });
  }
  
  console.log('Abbreviation expansion complete!');
}

expandAbbreviations()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
