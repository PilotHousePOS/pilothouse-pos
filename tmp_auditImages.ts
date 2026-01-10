import OpenAI from 'openai';
import { Pool } from '@neondatabase/serverless';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface ProductCheck {
  id: number;
  name: string;
  image_url: string;
  expected_flavor: string;
}

async function extractFlavor(name: string): Promise<string[]> {
  const flavors = ['salmon', 'chicken', 'beef', 'lamb', 'turkey', 'tuna', 'duck', 'pork', 'venison'];
  const found: string[] = [];
  const lowerName = name.toLowerCase();
  
  for (const flavor of flavors) {
    if (lowerName.includes(flavor)) {
      found.push(flavor);
    }
  }
  return found;
}

async function checkImage(imageUrl: string): Promise<string | null> {
  if (!imageUrl || !imageUrl.startsWith('http')) return null;
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',  // Use mini for cost efficiency
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `What flavor is shown on this pet food can/bag? Reply with just the flavor word(s) like "Salmon" or "Chicken" or "Beef". If you can't tell, reply "Unknown".` 
          },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 30
    });
    
    return response.choices[0]?.message?.content?.toLowerCase() || null;
  } catch (e: any) {
    console.log(`  Error checking ${imageUrl.slice(-30)}: ${e.message}`);
    return null;
  }
}

async function main() {
  // Get Science Diet products with flavor keywords
  const scienceDietQuery = `
    SELECT id, name, image_url 
    FROM supplies 
    WHERE name ILIKE '%Science Diet%'
    AND image_url IS NOT NULL
    AND image_url LIKE 'https://%'
    AND (
      name ILIKE '%salmon%' OR 
      name ILIKE '%chicken%' OR 
      name ILIKE '%beef%' OR 
      name ILIKE '%tuna%' OR
      name ILIKE '%turkey%' OR
      name ILIKE '%lamb%'
    )
    ORDER BY name
    LIMIT 30
  `;
  
  console.log('=== SCIENCE DIET FLAVOR/IMAGE AUDIT ===\n');
  
  const result = await pool.query(scienceDietQuery);
  const mismatches: any[] = [];
  
  for (const row of result.rows) {
    const expectedFlavors = await extractFlavor(row.name);
    if (expectedFlavors.length === 0) continue;
    
    console.log(`Checking ID ${row.id}: ${row.name.slice(0, 50)}...`);
    
    const imageFlavor = await checkImage(row.image_url);
    if (!imageFlavor || imageFlavor === 'unknown') {
      console.log(`  Could not determine image flavor`);
      continue;
    }
    
    // Check if image flavor matches expected
    const imageFlavorLower = imageFlavor.toLowerCase();
    const hasMatch = expectedFlavors.some(f => imageFlavorLower.includes(f));
    
    if (!hasMatch) {
      console.log(`  *** MISMATCH: Expected ${expectedFlavors.join('/')} but image shows "${imageFlavor}" ***`);
      mismatches.push({
        id: row.id,
        name: row.name,
        expected: expectedFlavors.join('/'),
        actual: imageFlavor,
        image_url: row.image_url
      });
    } else {
      console.log(`  OK: Image matches (${imageFlavor})`);
    }
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n=== SUMMARY ===');
  console.log(`Checked: ${result.rows.length} products`);
  console.log(`Mismatches found: ${mismatches.length}`);
  
  if (mismatches.length > 0) {
    console.log('\nMISMATCHED PRODUCTS:');
    for (const m of mismatches) {
      console.log(`  ID ${m.id}: "${m.name}" - Expected: ${m.expected}, Image shows: ${m.actual}`);
    }
  }
  
  await pool.end();
}

main().catch(console.error);
