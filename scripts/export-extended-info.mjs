#!/usr/bin/env node
import pg from 'pg';
import fs from 'fs';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function exportExtendedInfo() {
  console.log('Exporting extended product info from development database...\n');
  
  const result = await pool.query(`
    SELECT id, name, brand, ingredients, guaranteed_analysis, instructions, features
    FROM supplies 
    WHERE (ingredients IS NOT NULL AND ingredients != '')
       OR (guaranteed_analysis IS NOT NULL AND guaranteed_analysis != '')
       OR (instructions IS NOT NULL AND instructions != '')
       OR (features IS NOT NULL)
    ORDER BY id
  `);
  
  console.log(`Found ${result.rows.length} products with extended info:\n`);
  
  const exportData = {
    exportedAt: new Date().toISOString(),
    count: result.rows.length,
    products: result.rows.map(row => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      ingredients: row.ingredients,
      guaranteedAnalysis: row.guaranteed_analysis,
      instructions: row.instructions,
      features: row.features
    }))
  };
  
  for (const row of result.rows) {
    const hasIngredients = row.ingredients ? '✓' : '✗';
    const hasAnalysis = row.guaranteed_analysis ? '✓' : '✗';
    const hasInstructions = row.instructions ? '✓' : '✗';
    const hasFeatures = row.features ? '✓' : '✗';
    console.log(`  ID ${row.id}: ${row.name.substring(0, 50).padEnd(50)} [Ing:${hasIngredients} Ana:${hasAnalysis} Ins:${hasInstructions} Feat:${hasFeatures}]`);
  }
  
  const filename = `attached_assets/extended-info-export-${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
  console.log(`\nExported to: ${filename}`);
  
  console.log('\n--- SQL UPDATE STATEMENTS (for production) ---\n');
  
  let sqlStatements = [];
  for (const row of result.rows) {
    const updates = [];
    if (row.ingredients) {
      updates.push(`ingredients = '${row.ingredients.replace(/'/g, "''")}'`);
    }
    if (row.guaranteed_analysis) {
      updates.push(`guaranteed_analysis = '${row.guaranteed_analysis.replace(/'/g, "''")}'`);
    }
    if (row.instructions) {
      updates.push(`instructions = '${row.instructions.replace(/'/g, "''")}'`);
    }
    if (row.features) {
      updates.push(`features = '${JSON.stringify(row.features).replace(/'/g, "''")}'`);
    }
    
    if (updates.length > 0) {
      const sql = `UPDATE supplies SET ${updates.join(', ')} WHERE id = ${row.id};`;
      sqlStatements.push(sql);
    }
  }
  
  const sqlFilename = `attached_assets/extended-info-updates-${Date.now()}.sql`;
  fs.writeFileSync(sqlFilename, sqlStatements.join('\n'));
  console.log(`SQL file saved to: ${sqlFilename}`);
  console.log(`Total UPDATE statements: ${sqlStatements.length}`);
  
  await pool.end();
}

exportExtendedInfo().catch(console.error);
