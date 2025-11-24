/**
 * Step-by-step debug of Fromm abbreviation expansion
 */
import { storage } from './server/storage';

async function testStepByStep() {
  const testInput = 'Fromm Cat Duck À La Vegetable 10lb';
  console.log('=== STEP-BY-STEP FROMM EXPANSION DEBUG ===\n');
  console.log(`Input: "${testInput}"\n`);
  
  // Step 0: Test the pattern directly
  console.log('--- STEP 0: Direct Pattern Test ---');
  const pattern1 = /\b(Fromm)\s+(Cat\s+)?Duck\s+[AÀa]\s+La\s+(?:Veg|Vegetable)\b/gi;
  const directResult = testInput.replace(pattern1, (match, p1, p2) => `${p1} ${p2 || ''}Duck À La Veg`);
  console.log(`Pattern matches: ${pattern1.test(testInput)}`);
  pattern1.lastIndex = 0;
  console.log(`Direct replacement result: "${directResult}"`);
  console.log('');
  
  // Step 1: Apply just the pattern replacement (no brand catalog)
  console.log('--- STEP 1: Pattern Replacement (preProcessed) ---');
  let preProcessed = testInput;
  const frommDuckALaVegPattern = /\b(Fromm)\s+(Cat\s+)?Duck\s+[AÀa]\s+La\s+(?:Veg|Vegetable)\b/gi;
  preProcessed = preProcessed.replace(frommDuckALaVegPattern, (match, p1, p2) => `${p1} ${p2 || ''}Duck À La Veg`);
  console.log(`After pattern: "${preProcessed}"`);
  console.log('');
  
  // Step 2: Call expandProductName (brand catalog)
  console.log('--- STEP 2: Brand Catalog Expansion ---');
  const { expandProductName } = await import('./server/brandCatalog');
  const catalogResult = await expandProductName(storage, preProcessed);
  console.log(`After catalog: "${catalogResult}"`);
  console.log(`Changed: ${catalogResult !== preProcessed ? 'YES' : 'NO'}`);
  console.log('');
  
  // Step 3: Call full expandAbbreviationsAsync
  console.log('--- STEP 3: Full Async Expansion ---');
  const { expandAbbreviationsAsync } = await import('./server/abbreviationExpansion');
  const fullResult = await expandAbbreviationsAsync(testInput, storage);
  console.log(`Full result: "${fullResult.expanded}"`);
  console.log(`Catalog used: ${fullResult.catalogUsed}`);
  console.log('');
  
  // Conclusion
  console.log('--- CONCLUSION ---');
  console.log(`Input:          "${testInput}"`);
  console.log(`Expected:       "Fromm Cat Duck À La Veg 10lb"`);
  console.log(`Actual:         "${fullResult.expanded}"`);
  console.log(`Success:        ${fullResult.expanded.includes('Veg') && !fullResult.expanded.includes('Vegetable') ? '✅ YES' : '❌ NO'}`);
  
  process.exit(0);
}

testStepByStep().catch(console.error);
