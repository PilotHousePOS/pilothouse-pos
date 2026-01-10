import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

async function checkFlavor(imageUrl: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `What FLAVOR is shown on this pet food label? Reply with just the flavor word like "Chicken", "Beef", "Turkey", "Salmon", "Tuna", or "Unknown".` },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 20
    });
    return response.choices[0]?.message?.content?.toLowerCase() || 'unknown';
  } catch (e: any) {
    return 'error';
  }
}

async function main() {
  // Additional products to check
  const products = [
    // Cat products
    { id: 6716, name: 'Science Diet Cat Turkey 5.5oz', expected: 'turkey', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/8uukzJHoNbaACh1UxnMYD.png' },
    { id: 6721, name: 'Science Diet Cat Healthy Cuisine Tuna 2.9oz', expected: 'tuna', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/crVRajp8CLm2uQ2qd2uli.png' },
    { id: 6847, name: 'Science Diet Cat Urinary & Hairball Control Tuna Stew', expected: 'tuna', url: 'https://pxmshare.colgatepalmolive.com/JPEG_1000/CgK3hAbtX938EVx3FuAUh.jpg' },
    { id: 6848, name: 'Science Diet Cat Urinary Salmon Stew 2.9oz', expected: 'salmon', url: 'https://pxmshare.colgatepalmolive.com/JPEG_1000/2WvxwzRnu_l4SQYx33kO7.jpg' },
    { id: 6846, name: 'Science Diet Cat Urinary Chicken Stew 2.9oz', expected: 'chicken', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/CGGtMXIuEMuwgoFvzqd4P.png' },
    // Dog products - check Turkey and more
    { id: 6590, name: 'Science Diet Salmon 13oz', expected: 'salmon', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/WHzQbr6nxdx_8xO0koC9o.png' },
    { id: 6587, name: 'Science Diet Perfect Weight Salmon Stew 12.5oz', expected: 'salmon', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/oH1lxjgIPDqfhS9te2hSl.png' },
  ];
  
  console.log('=== ADDITIONAL SCIENCE DIET AUDIT ===\n');
  const mismatches: any[] = [];
  
  for (const p of products) {
    process.stdout.write(`ID ${p.id}: ${p.name.slice(0, 45).padEnd(45)} `);
    const imageFlavor = await checkFlavor(p.url);
    const matches = imageFlavor.includes(p.expected);
    
    if (matches) {
      console.log(`✓ OK (${imageFlavor})`);
    } else {
      console.log(`✗ MISMATCH: Expected ${p.expected}, got ${imageFlavor}`);
      mismatches.push({ ...p, actual: imageFlavor });
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log(`Total mismatches found: ${mismatches.length + 2}`); // +2 for already known
  console.log('\nKNOWN MISMATCHES:');
  console.log('  ID 6851: Science Diet Cat Senior Salmon Stew 2.8oz - Shows Chicken');
  console.log('  ID 6584: Science Diet 7+ Turkey 13oz - Shows Chicken');
  
  if (mismatches.length > 0) {
    console.log('\nNEW MISMATCHES:');
    for (const m of mismatches) {
      console.log(`  ID ${m.id}: ${m.name} - Shows ${m.actual}`);
    }
  }
}

main().catch(console.error);
