import { Pool } from "@neondatabase/serverless";
import * as fs from 'fs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upcMapping = JSON.parse(fs.readFileSync('/tmp/upc_mapping.json', 'utf8'));

function normalize(text: string | null): string {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/['"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(str1: string, str2: string): number {
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    const longer = Math.max(s1.length, s2.length);
    const shorter = Math.min(s1.length, s2.length);
    return shorter / longer;
  }
  
  // Count matching words
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w));
  
  return commonWords.length / Math.max(words1.length, words2.length);
}

async function matchProducts() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT id, name, brand 
      FROM supplies 
      WHERE (sku IS NULL OR sku = '')
      ORDER BY name
    `);
    const products = result.rows;
    
    console.log(`Found ${products.length} products without SKUs`);
    
    const upcEntries = Object.entries(upcMapping);
    const matches: any[] = [];
    
    for (const product of products) {
      let bestMatch: any = null;
      let bestScore = 0;
      
      for (const [upc, upcName] of upcEntries) {
        const score = similarity(product.name, upcName as string);
        
        if (score > bestScore && score >= 0.7) {
          bestScore = score;
          bestMatch = { upc, upcName, score };
        }
      }
      
      if (bestMatch && bestScore >= 0.75) {
        matches.push({
          productId: product.id,
          productName: product.name,
          upc: bestMatch.upc,
          upcName: bestMatch.upcName,
          score: bestMatch.score
        });
      }
    }
    
    console.log(`Found ${matches.length} matches (75%+ similarity)`);
    
    // Show sample matches
    console.log('\nSample matches:');
    for (const match of matches.slice(0, 20)) {
      console.log(`  ${match.productName} => ${match.upcName} (${match.upc}) [${(match.score * 100).toFixed(0)}%]`);
    }
    
    // Update matches with score >= 0.85
    const highConfidence = matches.filter(m => m.score >= 0.85);
    console.log(`\nUpdating ${highConfidence.length} high-confidence matches (85%+ similarity)`);
    
    for (const match of highConfidence) {
      await client.query('UPDATE supplies SET sku = $1 WHERE id = $2', [match.upc, match.productId]);
    }
    
    // Check new coverage
    const coverageResult = await client.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as with_sku,
        ROUND(100.0 * COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) / COUNT(*), 2) as coverage_percent
      FROM supplies;
    `);
    console.log('\nNew coverage:', coverageResult.rows[0]);
    
  } finally {
    client.release();
    await pool.end();
  }
}

matchProducts().catch(console.error);
