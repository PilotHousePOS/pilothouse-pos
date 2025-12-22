import fs from 'fs';

function normalizeUpc(upc) {
  const digits = (upc || '').replace(/\D/g, '');
  if (digits.length >= 8 && digits.length <= 14) {
    return digits.padStart(12, '0');
  }
  return null;
}

// Load inventory_maybe UPCs FIRST (primary source for target brands)
const invPath = '/home/runner/workspace/.local/state/memory/inventory_maybe_upcs.txt';
const inventoryData = new Map();
if (fs.existsSync(invPath)) {
  const lines = fs.readFileSync(invPath, 'utf-8').split('\n');
  for (const line of lines) {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx === -1) continue;
    const rawUpc = line.substring(0, pipeIdx);
    const name = line.substring(pipeIdx + 1).trim();
    const upc = normalizeUpc(rawUpc);
    if (upc && name) {
      inventoryData.set(upc, name);
    }
  }
  console.log(`Loaded ${inventoryData.size} from inventory_maybe_upcs`);
}

// Log sample Oxbow entries
let oxbowCount = 0;
for (const [upc, name] of inventoryData) {
  if (/oxbow/i.test(name)) {
    oxbowCount++;
    if (oxbowCount <= 3) console.log(`  Sample: ${upc} -> ${name}`);
  }
}
console.log(`  Total Oxbow in inventory_maybe: ${oxbowCount}`);

// Load other sources
const otherData = new Map();

// Comprehensive database
const compDbPath = '/home/runner/workspace/.local/state/memory/comprehensive_upc_database.txt';
if (fs.existsSync(compDbPath)) {
  const lines = fs.readFileSync(compDbPath, 'utf-8').split('\n');
  let count = 0;
  for (const line of lines) {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx === -1) continue;
    const rawUpc = line.substring(0, pipeIdx);
    const rest = line.substring(pipeIdx + 1);
    const pipeIdx2 = rest.indexOf('|');
    const name = pipeIdx2 > -1 ? rest.substring(0, pipeIdx2).trim() : rest.trim();
    const upc = normalizeUpc(rawUpc);
    if (upc && name && !otherData.has(upc)) {
      otherData.set(upc, { name, source: 'comprehensive' });
      count++;
    }
  }
  console.log(`Loaded ${count} from comprehensive database`);
}

// Master verified
const verifiedPath = 'scripts/master_verified_upcs.json';
if (fs.existsSync(verifiedPath)) {
  const data = JSON.parse(fs.readFileSync(verifiedPath, 'utf-8'));
  let count = 0;
  for (const item of data) {
    const upc = normalizeUpc(item.upc);
    if (upc && item.name && !otherData.has(upc)) {
      otherData.set(upc, { name: item.name.trim(), source: 'verified' });
      count++;
    }
  }
  console.log(`Added ${count} new from master_verified_upcs.json`);
}

// All combined JSON
const combinedPath = 'scripts/all_combined_upcs.json';
if (fs.existsSync(combinedPath)) {
  const data = JSON.parse(fs.readFileSync(combinedPath, 'utf-8'));
  let count = 0;
  for (const item of data) {
    const upc = normalizeUpc(item.upc);
    if (upc && item.name && !otherData.has(upc)) {
      otherData.set(upc, { name: item.name.trim(), source: 'combined' });
      count++;
    }
  }
  console.log(`Added ${count} new from all_combined_upcs.json`);
}

// Merge: inventory_maybe takes priority, then fill with other sources
const masterIndex = [];

// Add all inventory_maybe entries first
for (const [upc, name] of inventoryData) {
  masterIndex.push({ upc, name, source: 'inventory_maybe' });
}
console.log(`\nStarting with ${masterIndex.length} from inventory_maybe`);

// Add entries from other sources that don't exist in inventory_maybe
let added = 0;
for (const [upc, item] of otherData) {
  if (!inventoryData.has(upc)) {
    masterIndex.push({ upc, name: item.name, source: item.source });
    added++;
  }
}
console.log(`Added ${added} new entries from other sources`);

// Extract brands
const brandPatterns = [
  [/oxbow/i, 'oxbow'],
  [/smartbone/i, 'smartbones'],
  [/benebone/i, 'benebone'],
  [/barkworth/i, 'barkworthies'],
  [/penn.?plax/i, 'pennplax'],
  [/coastal/i, 'coastal'],
  [/zoo.?med|zml\s/i, 'zoomed'],
  [/tetra/i, 'tetra'],
  [/hikari/i, 'hikari'],
  [/exo.?terra/i, 'exoterra'],
  [/fluker/i, 'flukers'],
  [/kaytee/i, 'kaytee'],
  [/vitakraft/i, 'vitakraft'],
  [/nylabone/i, 'nylabone'],
  [/hartz/i, 'hartz'],
  [/nutro/i, 'nutro'],
  [/science.?diet/i, 'sciencediet'],
];

for (const entry of masterIndex) {
  entry.brand = '';
  for (const [pattern, brand] of brandPatterns) {
    if (pattern.test(entry.name)) {
      entry.brand = brand;
      break;
    }
  }
}

// Save
fs.writeFileSync('scripts/master_upc_index.json', JSON.stringify(masterIndex, null, 2));
console.log(`\nSaved ${masterIndex.length} entries to master_upc_index.json`);

// Count target brands
const brands = {};
for (const e of masterIndex) {
  if (e.brand) brands[e.brand] = (brands[e.brand] || 0) + 1;
}

console.log(`\n=== TARGET BRANDS IN NEW MASTER ===`);
console.log(`Oxbow: ${brands.oxbow || 0}`);
console.log(`SmartBones: ${brands.smartbones || 0}`);
console.log(`Benebone: ${brands.benebone || 0}`);
console.log(`Barkworthies: ${brands.barkworthies || 0}`);
console.log(`Penn-Plax: ${brands.pennplax || 0}`);
console.log(`Zoo Med: ${brands.zoomed || 0}`);
console.log(`Coastal: ${brands.coastal || 0}`);
