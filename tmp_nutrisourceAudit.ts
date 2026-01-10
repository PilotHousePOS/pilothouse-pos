import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

async function checkFlavor(imageUrl: string): Promise<string> {
  // NutriSource products use local object storage - need full URL
  const fullUrl = imageUrl.startsWith('/') ? `https://object-storage.replit.app${imageUrl}` : imageUrl;
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `What FLAVOR/PROTEIN is shown on this pet food bag/can? Reply with just the main protein like "Chicken", "Beef", "Lamb", "Salmon", "Turkey", or "Unknown".` },
          { type: 'image_url', image_url: { url: fullUrl } }
        ]
      }],
      max_tokens: 20
    });
    return response.choices[0]?.message?.content?.toLowerCase() || 'unknown';
  } catch (e: any) {
    return 'error: ' + e.message.slice(0, 50);
  }
}

function extractExpectedFlavor(name: string): string | null {
  const lowerName = name.toLowerCase();
  const flavors = ['salmon', 'chicken', 'beef', 'lamb', 'turkey', 'duck', 'pork', 'venison', 'trout', 'tuna'];
  for (const f of flavors) {
    if (lowerName.includes(f)) return f;
  }
  return null;
}

async function main() {
  // NutriSource products from the database
  const products = [
    { id: 6511, name: 'Nutrisource Adult Chicken & Rice Recipe 12.3oz', url: '/public-objects/products/nutrisource/nutrisource-adult-chicken-rice-recipe-12-6511-1-2w5ot3gq.jpg' },
    { id: 6509, name: 'Nutrisource Beef & Rice Recipe 12.3oz', url: '/public-objects/products/nutrisource/nutrisource-beef-rice-recipe-12-3oz-6509-1-i5c4clk1.jpg' },
    { id: 6506, name: 'Nutrisource Grain Free Lamb 12.3oz', url: '/public-objects/products/nutrisource/nutrisource-grain-free-lamb-12-3oz-6506-1-olhpqmos.jpg' },
    { id: 6510, name: 'Nutrisource Lamb Meal & Rice Recipe 12.3oz', url: '/public-objects/products/nutrisource/nutrisource-lamb-meal-rice-recipe-12-3oz-6510-1-xrhuisxl.jpg' },
    { id: 4792, name: 'Nutrisource Chompy Chompers Salmon & Trout', url: '/public-objects/products/nutrisource/nutrisource-chompy-chompers-salmon-trout-4792-1-ch13qg7l.jpg' },
    { id: 4793, name: 'Nutrisource Chompy Chompers Turkey & Duck', url: '/public-objects/products/nutrisource/nutrisource-chompy-chompers-turkey-duck-4793-1-7uhrvl37.jpg' },
    { id: 4799, name: 'Nutrisource Chompy Chompers Beef & Boar', url: '/public-objects/products/nutrisource/nutrisource-chompy-chompers-beef-boar-4799-1-6zoer3p6.jpg' },
    { id: 6693, name: 'Nutrisource Cat Turkey & Turkey Liver Select 5.5oz', url: '/public-objects/products/nutrisource/nutrisource-cat-turkey-turkey-liver-sele-6693-1-ego5sexw.jpg' },
    { id: 6691, name: 'Nutrisource Cat Chicken, Turkey & Lamb 5.5oz', url: '/public-objects/products/nutrisource/nutrisource-cat-chicken-turkey-lamb-5-5o-6691-1-m6rfuvvx.jpg' },
  ];
  
  console.log('=== NUTRISOURCE FLAVOR/IMAGE AUDIT ===\n');
  const mismatches: any[] = [];
  
  for (const p of products) {
    const expected = extractExpectedFlavor(p.name);
    if (!expected) continue;
    
    process.stdout.write(`ID ${p.id}: ${p.name.slice(0, 50).padEnd(50)} `);
    const imageFlavor = await checkFlavor(p.url);
    const matches = imageFlavor.includes(expected);
    
    if (matches || imageFlavor.includes('error')) {
      console.log(imageFlavor.includes('error') ? `? ${imageFlavor}` : `✓ OK (${imageFlavor})`);
    } else {
      console.log(`✗ MISMATCH: Expected ${expected}, got ${imageFlavor}`);
      mismatches.push({ ...p, expected, actual: imageFlavor });
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log('\n=== NUTRISOURCE SUMMARY ===');
  console.log(`Mismatches found: ${mismatches.length}`);
  
  if (mismatches.length > 0) {
    console.log('\nMISMATCHED PRODUCTS:');
    for (const m of mismatches) {
      console.log(`  ID ${m.id}: ${m.name} - Expected ${m.expected}, Shows ${m.actual}`);
    }
  }
}

main().catch(console.error);
