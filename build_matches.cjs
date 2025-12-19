const fs = require('fs');

// Load UPC database
const upcData = fs.readFileSync('.local/state/memory/inventory_maybe_upcs.txt', 'utf8')
  .split('\n')
  .filter(line => line.includes('|'))
  .map(line => {
    const [upc, name] = line.split('|');
    return { upc: upc.trim(), name: name ? name.trim() : '' };
  })
  .filter(entry => entry.upc && entry.name && entry.upc.length >= 10);

console.log(`Loaded ${upcData.length} UPC entries`);

// Build SQL for temp table
console.log('-- Create temp mapping and do bulk update');
console.log('CREATE TEMP TABLE upc_map (upc VARCHAR(50), name VARCHAR(500));');

// Batch insert the UPC data
const batches = [];
const batchSize = 100;
for (let i = 0; i < upcData.length; i += batchSize) {
  const batch = upcData.slice(i, i + batchSize);
  const values = batch.map(e => {
    const safeName = e.name.replace(/'/g, "''").substring(0, 500);
    return `('${e.upc}', '${safeName}')`;
  }).join(',\n');
  batches.push(`INSERT INTO upc_map (upc, name) VALUES ${values};`);
}
fs.writeFileSync('/tmp/upc_insert.sql', batches.join('\n'));
console.log(`Created ${batches.length} batches for ${upcData.length} UPCs`);
