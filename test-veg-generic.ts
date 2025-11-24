/**
 * Test that generic "Veg" → "Vegetable" expansion still works for non-Fromm products
 */
import { expandAbbreviationsAsync } from './server/abbreviationExpansion';
import { storage } from './server/storage';

async function testGenericVeg() {
  const testCases = [
    { input: 'Fromm Cat Duck À La Veg 10lb', expected: 'Fromm Cat Duck À La Veg 10lb', shouldProtect: true },
    { input: 'Blue Buffalo Veg Blend 12oz', expected: 'Blue Buffalo Vegetable Blend 12oz', shouldProtect: false },
    { input: 'Merrick Veg Mix 5lb', expected: 'Merrick Vegetable Mix 5lb', shouldProtect: false },
    { input: 'Generic Brand Veg Treats', expected: 'Generic Brand Vegetable Treats', shouldProtect: false }
  ];

  console.log('=== TESTING VEG EXPANSION CONTEXT-AWARENESS ===\n');
  
  for (const test of testCases) {
    const result = await expandAbbreviationsAsync(test.input, storage);
    const success = result.expanded === test.expected;
    
    console.log(`Input:    "${test.input}"`);
    console.log(`Expected: "${test.expected}"`);
    console.log(`Actual:   "${result.expanded}"`);
    console.log(`Protected: ${test.shouldProtect ? 'YES (Fromm)' : 'NO (should expand)'}`);
    console.log(`Result:   ${success ? '✅ PASS' : '❌ FAIL'}`);
    console.log('');
  }
  
  process.exit(0);
}

testGenericVeg().catch(console.error);
