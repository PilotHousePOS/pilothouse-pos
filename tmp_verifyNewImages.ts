import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

async function checkFlavor(imageUrl: string, description: string): Promise<void> {
  console.log(`\n${description}`);
  console.log(`URL: ${imageUrl.slice(-50)}`);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `What FLAVOR is shown on this pet food can/bag? Reply with just the flavor word like "Chicken", "Beef", "Turkey", "Salmon", or "Tuna".` },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 30
    });
    
    console.log(`Result: ${response.choices[0]?.message?.content}`);
  } catch (e: any) {
    console.log(`Error: ${e.message}`);
  }
}

async function main() {
  // Verify new images
  await checkFlavor(
    'https://pxmshare.colgatepalmolive.com/JPEG_1000/JeYtmeJVDbcbi6k9qNzEU.jpg',
    'Turkey 13oz - from Hill\'s shop'
  );
  
  await checkFlavor(
    'https://image.chewy.com/catalog/general/images/moe/0680bf23-a4cf-7e27-8000-b4bc7918e548._AC_SL1200_QL100_V1_.jpg',
    'Tuna Urinary Stew - from Chewy'
  );
}

main().catch(console.error);
