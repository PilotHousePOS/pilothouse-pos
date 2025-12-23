#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const TREAT_KEYWORDS = [
  'treat', 'treats', 'biscuit', 'biscuits', 'chew', 'chews', 'jerky', 'stick', 'sticks',
  'snack', 'snacks', 'dental', 'bone', 'bones', 'rawhide', 'bully', 'tendon',
  'pig ear', 'antler', 'marrow', 'training'
];

const FOOD_KEYWORDS = [
  'food', 'kibble', 'dry food', 'wet food', 'canned', 'formula', 'recipe', 
  'diet', 'nutrition', 'meal', 'dinner', 'entree', 'pate', 'stew', 'gravy'
];

const CAT_KEYWORDS = ['cat', 'cats', 'kitten', 'feline'];
const DOG_KEYWORDS = ['dog', 'dogs', 'puppy', 'puppies', 'canine'];

function normalizeText(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractProductType(name) {
  const normalized = normalizeText(name);
  const isTreat = TREAT_KEYWORDS.some(kw => normalized.includes(kw));
  const isFood = FOOD_KEYWORDS.some(kw => normalized.includes(kw));
  const isCat = CAT_KEYWORDS.some(kw => normalized.includes(kw));
  const isDog = DOG_KEYWORDS.some(kw => normalized.includes(kw));
  
  return {
    isTreat,
    isFood,
    isCat,
    isDog,
    species: isCat ? 'cat' : (isDog ? 'dog' : 'unknown'),
    productType: isTreat ? 'treat' : (isFood ? 'food' : 'other')
  };
}

function extractSizeWeight(name) {
  const normalized = normalizeText(name);
  
  const weightMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|oz|kg|g|gram|grams|pound|pounds|ounce|ounces)/i);
  const countMatch = normalized.match(/(\d+)\s*(ct|count|pk|pack|piece|pcs)/i);
  
  return {
    weight: weightMatch ? { value: parseFloat(weightMatch[1]), unit: weightMatch[2].toLowerCase() } : null,
    count: countMatch ? parseInt(countMatch[1]) : null
  };
}

async function main() {
  console.log('=== UPC Cross-Product Contamination Audit ===\n');
  
  let upcData;
  try {
    upcData = JSON.parse(readFileSync('scripts/ALL_UPCS_EXPANDED.json', 'utf8'));
  } catch (e) {
    console.error('Could not load UPC data:', e.message);
    return;
  }
  
  const upcLookup = new Map();
  for (const item of upcData) {
    const upc = (item.upc || item.UPC || '').toString().replace(/\D/g, '');
    if (upc) {
      upcLookup.set(upc, item);
      if (upc.length === 12) upcLookup.set(upc.slice(1), item);
      if (upc.length === 11) upcLookup.set('0' + upc, item);
    }
  }
  
  console.log(`Loaded ${upcLookup.size} UPCs for reference\n`);
  
  let suppliesData;
  try {
    const files = ['attached_assets/supplies-export-1766522331196_1766522340365.json'];
    for (const file of files) {
      try {
        suppliesData = JSON.parse(readFileSync(file, 'utf8'));
        console.log(`Loaded supplies from ${file}\n`);
        break;
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.error('Could not load supplies data');
    return;
  }
  
  if (!suppliesData) {
    console.log('No supplies data found - will need database query');
    return;
  }
  
  const suspectMatches = [];
  let checkedCount = 0;
  let mismatchCount = 0;
  
  for (const supply of suppliesData) {
    if (!supply.upc) continue;
    checkedCount++;
    
    const supplyType = extractProductType(supply.name);
    const supplySize = extractSizeWeight(supply.name);
    
    const upcRef = upcLookup.get(supply.upc) || upcLookup.get(supply.upc.toString());
    
    if (upcRef) {
      const upcName = upcRef.name || upcRef.description || upcRef.product_name || '';
      const upcType = extractProductType(upcName);
      const upcSize = extractSizeWeight(upcName);
      
      const issues = [];
      
      if (supplyType.productType !== 'other' && upcType.productType !== 'other' && 
          supplyType.productType !== upcType.productType) {
        issues.push(`PRODUCT_TYPE: supply=${supplyType.productType}, upc=${upcType.productType}`);
      }
      
      if (supplyType.species !== 'unknown' && upcType.species !== 'unknown' &&
          supplyType.species !== upcType.species) {
        issues.push(`SPECIES: supply=${supplyType.species}, upc=${upcType.species}`);
      }
      
      if (supplySize.weight && upcSize.weight) {
        const supplyNorm = normalizeWeight(supplySize.weight);
        const upcNorm = normalizeWeight(upcSize.weight);
        if (Math.abs(supplyNorm - upcNorm) > 0.1 * Math.max(supplyNorm, upcNorm)) {
          issues.push(`WEIGHT: supply=${supplySize.weight.value}${supplySize.weight.unit}, upc=${upcSize.weight.value}${upcSize.weight.unit}`);
        }
      }
      
      if (supplySize.count && upcSize.count && supplySize.count !== upcSize.count) {
        issues.push(`COUNT: supply=${supplySize.count}, upc=${upcSize.count}`);
      }
      
      if (issues.length > 0) {
        mismatchCount++;
        suspectMatches.push({
          id: supply.id,
          supplyName: supply.name,
          brand: supply.brand,
          upc: supply.upc,
          upcName: upcName,
          issues: issues,
          severity: issues.some(i => i.startsWith('PRODUCT_TYPE') || i.startsWith('SPECIES')) ? 'HIGH' : 'MEDIUM'
        });
      }
    }
  }
  
  console.log(`Checked ${checkedCount} supplies with UPCs`);
  console.log(`Found ${mismatchCount} potential mismatches\n`);
  
  const highSeverity = suspectMatches.filter(m => m.severity === 'HIGH');
  const mediumSeverity = suspectMatches.filter(m => m.severity === 'MEDIUM');
  
  console.log(`HIGH severity (product type/species mismatch): ${highSeverity.length}`);
  console.log(`MEDIUM severity (size/count mismatch): ${mediumSeverity.length}\n`);
  
  if (highSeverity.length > 0) {
    console.log('=== HIGH SEVERITY MISMATCHES ===\n');
    for (const match of highSeverity.slice(0, 50)) {
      console.log(`ID: ${match.id}`);
      console.log(`Supply: ${match.supplyName}`);
      console.log(`Brand: ${match.brand}`);
      console.log(`UPC: ${match.upc}`);
      console.log(`UPC Source: ${match.upcName}`);
      console.log(`Issues: ${match.issues.join(', ')}`);
      console.log('---');
    }
  }
  
  writeFileSync('scripts/suspect_upc_matches.json', JSON.stringify(suspectMatches, null, 2));
  console.log(`\nFull results saved to scripts/suspect_upc_matches.json`);
}

function normalizeWeight(weight) {
  const value = weight.value;
  const unit = weight.unit;
  
  if (unit.startsWith('lb') || unit.startsWith('pound')) return value * 16;
  if (unit.startsWith('oz') || unit.startsWith('ounce')) return value;
  if (unit === 'kg') return value * 35.274;
  if (unit === 'g' || unit.startsWith('gram')) return value / 28.35;
  return value;
}

main().catch(console.error);
