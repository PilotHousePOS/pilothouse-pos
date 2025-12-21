const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  // Get products with UPCs
  const { rows: withUpc } = await pool.query(`SELECT id, name, brand, sku FROM supplies WHERE sku IS NOT NULL AND sku != ''`);
  console.log(`${withUpc.length} products with UPC`);
  
  // Get products without UPCs  
  const { rows: noUpc } = await pool.query(`SELECT id, name, brand FROM supplies WHERE sku IS NULL OR sku = ''`);
  console.log(`${noUpc.length} products without UPC`);
  
  // Build lookup from products with UPCs
  const upcByNormName = new Map();
  for (const p of withUpc) {
    const norm = normalize(p.name);
    if (!upcByNormName.has(norm)) {
      upcByNormName.set(norm, p.sku);
    }
  }
  
  // Try to match products without UPC using same normalized name
  let duplicateMatches = 0;
  for (const p of noUpc) {
    const norm = normalize(p.name);
    if (upcByNormName.has(norm)) {
      duplicateMatches++;
    }
  }
  
  console.log(`\n${duplicateMatches} products without UPC have same normalized name as products WITH UPC`);
  console.log('(These might be legitimate duplicates that can share UPCs)');
  
  // Sample some products without UPC
  console.log('\nSample products without UPC:');
  for (let i = 0; i < 10 && i < noUpc.length; i++) {
    console.log(`  ${noUpc[i].id}: ${noUpc[i].name}`);
  }
  
  await pool.end();
}

main().catch(console.error);
