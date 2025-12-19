const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function clearBad() {
  const badMatches = JSON.parse(fs.readFileSync('/tmp/bad_matches.json', 'utf8'));
  const ids = badMatches.map(m => m.id);
  
  console.log(`Clearing SKUs from ${ids.length} products with bad matches...`);
  
  const client = await pool.connect();
  try {
    const result = await client.query(`
      UPDATE supplies SET sku = NULL WHERE id = ANY($1)
    `, [ids]);
    
    console.log(`Cleared ${result.rowCount} SKUs`);
  } finally {
    client.release();
    await pool.end();
  }
}

clearBad().catch(console.error);
