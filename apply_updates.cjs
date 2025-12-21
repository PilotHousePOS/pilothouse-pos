const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const sql = fs.readFileSync('./upc_updates.sql', 'utf8');
  const lines = sql.split('\n').filter(l => l.trim());
  
  console.log(`Applying ${lines.length} updates...`);
  
  for (let i = 0; i < lines.length; i += 100) {
    const batch = lines.slice(i, i + 100);
    for (const line of batch) {
      await pool.query(line);
    }
    console.log(`Applied ${Math.min(i + 100, lines.length)} / ${lines.length}`);
  }
  
  // Check final stats
  const { rows: [stats] } = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_upc
    FROM supplies
  `);
  
  const pct = ((stats.with_upc / stats.total) * 100).toFixed(1);
  console.log(`\nFinal coverage: ${stats.with_upc} / ${stats.total} (${pct}%)`);
  
  await pool.end();
}

main().catch(console.error);
