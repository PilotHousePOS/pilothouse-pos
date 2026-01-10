import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

async function checkFlavor(imageUrl: string, productName: string): Promise<void> {
  console.log(`\nChecking: ${productName}`);
  console.log(`Image: ${imageUrl.split('/').pop()}`);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `What FLAVOR is shown on this pet food can/bag? Look for text on the label. Reply with just the flavor like "Chicken", "Beef", "Turkey", "Salmon", or "Tuna".` 
          },
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
  // Check suspicious products
  const products = [
    { id: 6584, name: 'Science Diet 7+ Turkey 13oz', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/BFEBA_hG6Kzy5RKpILFHk.png' },
    { id: 6586, name: 'Science Diet 7+ Chicken 13oz', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/BFEBA_hG6Kzy5RKpILFHk.png' },
    { id: 6585, name: 'Science Diet 7+ Beef 13oz', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/4pJRNTe_yICPlxF8-N1yZ.png' },
    { id: 6568, name: 'Science Diet 7+ Beef 5.8oz', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/4pJRNTe_yICPlxF8-N1yZ.png' },
    { id: 6562, name: 'Science Diet Beef Stew 3.5oz', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/4t6yrv3AFBytXGTo2z0BK.png' },
    { id: 6571, name: 'Science Diet Beef Stew 12.8oz', url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/4t6yrv3AFBytXGTo2z0BK.png' },
    { id: 6851, name: 'Science Diet Cat Senior Salmon Stew 2.8oz', url: 'https://pxmshare.colgatepalmolive.com/JPEG_1000/Nrwa_gzvNK5ku5uy3I-gs.jpg' },
    { id: 6850, name: 'Science Diet Cat Indoor Salmon Stew 2.8oz', url: 'https://pxmshare.colgatepalmolive.com/JPEG_1000/7FYBwljp2-_sYRPv4ZGOx.jpg' },
  ];
  
  for (const p of products) {
    await checkFlavor(p.url, `[ID ${p.id}] ${p.name}`);
  }
}

main().catch(console.error);
