import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function restoreKongUpcs() {
  // Load rollback backup (source of truth for Kong UPCs)
  const rollback = JSON.parse(fs.readFileSync('backups/rollback-inventory-2025-12-26.json', 'utf8'));
  const rollbackKong = rollback.data.supplies.filter(p => p.brand === 'Kong' && p.sku);
  
  console.log(`Found ${rollbackKong.length} Kong products with UPCs in rollback backup\n`);
  
  // Get current database Kong products
  const { rows: currentKong } = await pool.query(`
    SELECT id, name, sku FROM supplies WHERE brand = 'Kong'
  `);
  console.log(`Found ${currentKong.length} Kong products in database\n`);
  
  const currentMap = new Map(currentKong.map(p => [p.id, p]));
  
  let updated = 0;
  let unchanged = 0;
  let notFound = 0;
  
  for (const rollbackProduct of rollbackKong) {
    const current = currentMap.get(rollbackProduct.id);
    
    if (!current) {
      notFound++;
      continue;
    }
    
    if (current.sku !== rollbackProduct.sku) {
      // Update UPC to match rollback backup
      await pool.query(
        `UPDATE supplies SET sku = $1, upc = $1 WHERE id = $2`,
        [rollbackProduct.sku, rollbackProduct.id]
      );
      console.log(`✓ ID ${rollbackProduct.id}: ${rollbackProduct.name}`);
      console.log(`  Old: ${current.sku || 'none'} → New: ${rollbackProduct.sku}`);
      updated++;
    } else {
      unchanged++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Not found in DB: ${notFound}`);
  
  await pool.end();
}

restoreKongUpcs().catch(console.error);
