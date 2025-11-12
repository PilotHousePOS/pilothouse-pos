import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { getValidationPatterns } from './shared-mappings';

async function main() {
  console.log('==============================================');
  console.log('   CHECK ABBREVIATIONS IN ALL PRODUCTS');
  console.log('==============================================\n');
  
  const allSupplies = await db.select().from(supplies);
  
  console.log(`📊 Total products: ${allSupplies.length}\n`);
  
  // Group by category
  const byCategory: Record<string, number> = {};
  allSupplies.forEach(s => {
    byCategory[s.category] = (byCategory[s.category] || 0) + 1;
  });
  
  console.log('Categories:');
  Object.entries(byCategory).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count} products`);
  });
  console.log();
  
  // Check for abbreviations
  const patterns = getValidationPatterns();
  const allPatterns = [
    ...Object.values(patterns.brands).flat(),
    ...Object.values(patterns.colors).flat(),
    ...Object.values(patterns.proteins).flat(),
    ...Object.values(patterns.other || {}).flat(),
    ...Object.values(patterns.lifestages).flat(),
    ...Object.values(patterns.measurements).flat(),
    ...Object.values(patterns.sizes).flat().map(s => s.toLowerCase())
  ];
  
  const productsWithAbbreviations: Array<{id: number; name: string; category: string; matches: string[]}> = [];
  
  for (const supply of allSupplies) {
    const matches: string[] = [];
    const textToCheck = `${supply.name} ${supply.description || ''}`.toLowerCase();
    
    // Check for common abbreviations
    if (/\bturk\b/i.test(textToCheck)) matches.push('turk');
    if (/\bsen\b/i.test(textToCheck)) matches.push('sen');
    if (/\bfil\b/i.test(textToCheck)) matches.push('fil');
    if (/\bmig\b/i.test(textToCheck)) matches.push('mig');
    if (/\bgrav\b/i.test(textToCheck)) matches.push('grav');
    if (/\bshrim\b/i.test(textToCheck)) matches.push('shrim');
    if (/\bgrn\b/i.test(textToCheck)) matches.push('grn');
    if (/\bck\b/i.test(textToCheck)) matches.push('ck');
    if (/\bchk\b/i.test(textToCheck)) matches.push('chk');
    if (/\blam\b/i.test(textToCheck)) matches.push('lam');
    if (/\bbf\b/i.test(textToCheck)) matches.push('bf');
    if (/\btk\b/i.test(textToCheck)) matches.push('tk');
    if (/\btrk\b/i.test(textToCheck)) matches.push('trk');
    if (/\bsalm\b/i.test(textToCheck)) matches.push('salm');
    if (/\bduc\b/i.test(textToCheck)) matches.push('duc');
    if (/\bri\b/i.test(textToCheck)) matches.push('ri');
    if (/\bwh\b/i.test(textToCheck)) matches.push('wh');
    if (/\bwhi\b/i.test(textToCheck)) matches.push('whi');
    if (/\bgre\b/i.test(textToCheck)) matches.push('gre');
    if (/\bbl\b/i.test(textToCheck)) matches.push('bl');
    if (/\bpup\b/i.test(textToCheck)) matches.push('pup');
    if (/\bjr\b/i.test(textToCheck)) matches.push('jr');
    if (/\bsr\b/i.test(textToCheck)) matches.push('sr');
    if (/\bad\b/i.test(textToCheck)) matches.push('ad');
    if (/\badt\b/i.test(textToCheck)) matches.push('adt');
    if (/#/.test(textToCheck)) matches.push('#');
    
    if (matches.length > 0) {
      productsWithAbbreviations.push({
        id: supply.id,
        name: supply.name,
        category: supply.category,
        matches: [...new Set(matches)]
      });
    }
  }
  
  console.log(`\n📊 Products with abbreviations: ${productsWithAbbreviations.length}\n`);
  
  // Group by category
  const abbrevByCategory: Record<string, number> = {};
  productsWithAbbreviations.forEach(p => {
    abbrevByCategory[p.category] = (abbrevByCategory[p.category] || 0) + 1;
  });
  
  console.log('Abbreviations by category:');
  Object.entries(abbrevByCategory).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count} products`);
  });
  console.log();
  
  // Show samples by category
  console.log('Sample products with abbreviations (by category):\n');
  const categories = [...new Set(productsWithAbbreviations.map(p => p.category))];
  categories.forEach(cat => {
    const samples = productsWithAbbreviations.filter(p => p.category === cat).slice(0, 5);
    console.log(`${cat.toUpperCase()}:`);
    samples.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} [${p.matches.join(', ')}]`);
    });
    console.log();
  });
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
