import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

async function verifyImage(imageUrl: string, label: string) {
  console.log(`\nAnalyzing ${label}: ${imageUrl}`);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `Look at this cat food product image. What FLAVOR is shown (Salmon, Chicken, Tuna, etc.)? What is the full product name visible? Reply in format: FLAVOR: [flavor] | PRODUCT: [full name]` 
          },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 200
    });
    
    console.log('Result:', response.choices[0]?.message?.content);
  } catch (e: any) {
    console.log('Error:', e.message);
  }
}

// Check several Science Diet Senior Vitality images to find Salmon
const images = [
  // Tuna Stew Senior Vitality from Hill's listing
  { url: 'https://pxmshare.colgatepalmolive.com/PNG_500/MiZSW3EU9ajXas6mqgZC_.png', label: 'Tuna Stew from Hill\'s listing' },
  
  // Try the higher res versions
  { url: 'https://pxmshare.colgatepalmolive.com/PNG_2000/MiZSW3EU9ajXas6mqgZC_.png', label: 'Tuna Stew PNG_2000' },
  
  // Try the Indoor Salmon Stew as reference
  { url: 'https://pxmshare.colgatepalmolive.com/JPEG_1000/7FYBwljp2-_sYRPv4ZGOx.jpg', label: 'Indoor Salmon Stew (ID 6850)' },
];

(async () => {
  for (const img of images) {
    await verifyImage(img.url, img.label);
  }
})();
