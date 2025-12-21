const fs = require('fs');
const { Pool } = require('pg');

async function main() {
  const backup = JSON.parse(fs.readFileSync('upc_sku_backup.json', 'utf8'));
  console.log(`Loaded ${backup.length} entries from backup`);
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  
  try {
    // First, clear all current SKUs
    await client.query(`UPDATE supplies SET sku = NULL`);
    console.log('Cleared all current SKUs');
    
    // Restore from backup - but only if UPC is valid and unique
    const upcCounts = new Map();
    for (const entry of backup) {
      if (!entry.sku || entry.sku.length < 10) continue;
      upcCounts.set(entry.sku, (upcCounts.get(entry.sku) || 0) + 1);
    }
    
    // Only restore unique UPCs
    let restored = 0;
    let skipped = 0;
    const usedUpcs = new Set();
    
    for (const entry of backup) {
      if (!entry.sku || entry.sku.length < 10) continue;
      
      // Skip duplicates in backup
      if (upcCounts.get(entry.sku) > 1) {
        skipped++;
        continue;
      }
      
      if (usedUpcs.has(entry.sku)) continue;
      
      await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [entry.sku, entry.id]);
      usedUpcs.add(entry.sku);
      restored++;
    }
    
    console.log(`Restored ${restored} UPCs, skipped ${skipped} duplicates`);
    
    const final = await client.query(`
      SELECT COUNT(*) as total, COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
      FROM supplies
    `);
    console.log(`Coverage: ${(final.rows[0].with_upc / final.rows[0].total * 100).toFixed(1)}%`);
    
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(console.error);
