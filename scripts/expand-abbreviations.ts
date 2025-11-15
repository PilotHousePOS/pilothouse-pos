import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function expandAbbreviations() {
  console.log('Expanding abbreviations in product names and descriptions...\n');
  
  // Define abbreviation mappings
  const abbreviations = [
    // Brand abbreviations (multi-word first)
    { pattern: /\bTaste of the Wild\b/gi, replacement: 'Taste of the Wild' },
    { pattern: /\bNatural Balance\b/gi, replacement: 'Natural Balance' },
    { pattern: /\bFerret Nation\b/gi, replacement: 'Ferret Nation' },
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
    
    // Short brand abbreviations at start of product name
    { pattern: /^Tow\b/gi, replacement: 'Taste of the Wild' },
    { pattern: /^Toe\b/gi, replacement: 'Taste of the Wild' },
    { pattern: /^Nb\b/gi, replacement: 'Natural Balance' },
    { pattern: /^Zig\b/gi, replacement: 'Zignature' },
    { pattern: /^Nyla\b/gi, replacement: 'Nylabone' },
    { pattern: /^Diam\b/gi, replacement: 'Diamond' },
    { pattern: /^Orij\b/gi, replacement: 'Orijen' },
    { pattern: /^Cand\b/gi, replacement: 'Canidae' },
    
    // Multi-word phrases (must come before single words)
    { pattern: /\bFromm Gold Weight\b(?! Management)/gi, replacement: 'Fromm Gold Weight Management' },
    { pattern: /\bPerf Weight\b/gi, replacement: 'Perfect Weight' },
    { pattern: /\bMini Chu\b/gi, replacement: 'Minniechuncks' },
    { pattern: /\bGr Fr\b/gi, replacement: 'Grain Free' },
    { pattern: /\bConure&tiel\b/gi, replacement: 'Conure & Cockatiel' },
    { pattern: /\bConure&lovebird\b/gi, replacement: 'Conure & Lovebird' },
    { pattern: /\bRat&mouse\b/gi, replacement: 'Rat & Mouse' },
    { pattern: /\bChkn&dck\b/gi, replacement: 'Chicken & Duck' },
    { pattern: /\bChkn&lvr\b/gi, replacement: 'Chicken & Liver' },
    { pattern: /\bChkn&shrimp\b/gi, replacement: 'Chicken & Shrimp' },
    { pattern: /\bChkn&salmon\b/gi, replacement: 'Chicken & Salmon' },
    { pattern: /\bChkn&turkey\b/gi, replacement: 'Chicken & Turkey' },
    { pattern: /\bTuna&chkn\b/gi, replacement: 'Tuna & Chicken' },
    { pattern: /\bTuk,Sard\b/gi, replacement: 'Turkey, Sardine' },
    { pattern: /\bTurkey,Sard\b/gi, replacement: 'Turkey, Sardine' },
    { pattern: /\bAll Life Stages\b/gi, replacement: 'All Life Stages' },
    { pattern: /\bRoc Moun\b/gi, replacement: 'Rocky Mountain' },
    { pattern: /\bAnc Mount\b/gi, replacement: 'Ancient Mountain' },
    { pattern: /\bAnc Stream\b/gi, replacement: 'Ancient Stream' },
    { pattern: /\bAnc Prairie\b/gi, replacement: 'Ancient Prairie' },
    { pattern: /\bAnc Wetland\b/gi, replacement: 'Ancient Wetland' },
    { pattern: /\bPacif Stre\b/gi, replacement: 'Pacific Stream' },
    { pattern: /\bPacif Stream\b/gi, replacement: 'Pacific Stream' },
    { pattern: /\bCan Riv\b/gi, replacement: 'Canyon River' },
    { pattern: /\bHigh Prairie\b/gi, replacement: 'High Prairie' },
    { pattern: /\bGlow in the Dark\b/gi, replacement: 'Glow in the Dark' },
    { pattern: /\bClmbree\b/gi, replacement: 'Calm Breeze' },
    { pattern: /\bBbypdr\b/gi, replacement: 'Baby powder' },
    { pattern: /\bWorldsbestcatlitter\b/gi, replacement: "World's Best Cat Litter" },
    { pattern: /\bSwtpot\b/gi, replacement: 'Sweet Potato' },
    { pattern: /\bBeggarbns\b/gi, replacement: "Beggin'" },
    { pattern: /\bFrndsfrm\b/gi, replacement: 'Friends From The Farm' },
    
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
    { pattern: /\bSal\b/gi, replacement: 'Salmon' },
    { pattern: /\bProc\b/gi, replacement: 'Process' },
    { pattern: /\bNat\b/gi, replacement: 'Natural' },
    { pattern: /\bFd\b/gi, replacement: 'Freeze Dried' },
    { pattern: /\bAls\b/gi, replacement: 'All Life Stages' },
    { pattern: /\bAnc\b/gi, replacement: 'Ancient' },
    { pattern: /\bRoc\b/gi, replacement: 'Rocky' },
    { pattern: /\bMoun\b/gi, replacement: 'Mountain' },
    { pattern: /\bRiv\b/gi, replacement: 'River' },
    { pattern: /\bStre\b/gi, replacement: 'Stream' },
    { pattern: /\bPacif\b/gi, replacement: 'Pacific' },
    { pattern: /\bFro\b/gi, replacement: 'Frozen' },
    { pattern: /\bFrzn\b/gi, replacement: 'Frozen' },
    { pattern: /\bNug\b/gi, replacement: 'Nuggets' },
    { pattern: /\bPron\b/gi, replacement: 'Pronto' },
    { pattern: /\bPront\b/gi, replacement: 'Pronto' },
    { pattern: /\bChkn\b/gi, replacement: 'Chicken' },
    { pattern: /\bBef\b/gi, replacement: 'Beef' },
    { pattern: /\bLam\b/gi, replacement: 'Lamb' },
    { pattern: /\bRab\b/gi, replacement: 'Rabbit' },
    { pattern: /\bVen\b/gi, replacement: 'Venison' },
    { pattern: /\bTuk\b/gi, replacement: 'Turkey' },
    { pattern: /\bSard\b/gi, replacement: 'Sardine' },
    { pattern: /\bLvr\b/gi, replacement: 'Liver' },
    { pattern: /\bDck\b/gi, replacement: 'Duck' },
    { pattern: /\bGitd\b/gi, replacement: 'Glow in the Dark' },
    
    // Spelling corrections
    { pattern: /\bVegtable\b/gi, replacement: 'Vegetable' },
    { pattern: /\bThermoter\b/gi, replacement: 'Thermometer' },
    { pattern: /\bWatm\b/gi, replacement: 'Watermelon' },
    { pattern: /\bSunburts\b/gi, replacement: 'Sunburst' },
    { pattern: /\bCockateil\b/gi, replacement: 'Cockatiel' },
    { pattern: /\bPrarie\b/gi, replacement: 'Prairie' },
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
