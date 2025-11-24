/**
 * Debug script to test Fromm abbreviation expansion
 */
import { expandAbbreviationsAsync } from './server/abbreviationExpansion';
import { storage } from './server/storage';

async function testFrommExpansion() {
  const testCases = [
    'Fromm Cat Duck À La Vegetable 10lb',
    'Fromm Beef Frittata Vegetable 10lb',
    'Fromm Cat Beef Liváttini Vegetable 4lb',
    'Fromm Chicken À La Vegetable 12lb',
    'Fromm Salmon À La Vegetable 26lb'
  ];

  console.log('=== TESTING FROMM ABBREVIATION EXPANSION ===\n');
  
  for (const testName of testCases) {
    const result = await expandAbbreviationsAsync(testName, storage);
    const changed = result.expanded !== testName;
    
    console.log(`Input:  "${testName}"`);
    console.log(`Output: "${result.expanded}"`);
    console.log(`Changed: ${changed ? 'YES ✅' : 'NO ❌'}`);
    console.log(`Catalog Used: ${result.catalogUsed}`);
    console.log('');
  }
  
  console.log('=== NOW TESTING WITH ACTUAL DATABASE VALUES ===\n');
  
  const supplies = await storage.getAllSupplies();
  const frommVegSupplies = supplies.filter(s => 
    s.name.includes('Fromm') && s.name.includes('Vegetable')
  );
  
  console.log(`Found ${frommVegSupplies.length} supplies with "Fromm" and "Vegetable":\n`);
  
  for (const supply of frommVegSupplies.slice(0, 5)) {
    const result = await expandAbbreviationsAsync(supply.name, storage);
    const changed = result.expanded !== supply.name;
    
    console.log(`ID: ${supply.id}`);
    console.log(`Input:  "${supply.name}"`);
    console.log(`Output: "${result.expanded}"`);
    console.log(`Changed: ${changed ? 'YES ✅' : 'NO ❌'}`);
    console.log('');
  }
  
  process.exit(0);
}

testFrommExpansion().catch(console.error);
