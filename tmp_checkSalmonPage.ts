import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

async function analyzeImage(imageUrl: string) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `Describe this image in detail. What does it show? Is it a cat food can? If so, what flavor is on the label? What brand? What text can you read?` 
          },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 300
    });
    
    return response.choices[0]?.message?.content;
  } catch (e: any) {
    return 'Error: ' + e.message;
  }
}

// Check ALL images from the Salmon page
const images = [
  '2Hw6GmseL5AVvDyG_xlRg.jpg',
  'hwGdW595odT8a89WmNqyi.jpg', 
  'rlwOiAkyMtQIpf-9lnlLJ.jpg',
  'rundLw9Ru2js21y2Jcv_z.jpg',
  'vvZIzWPcHBLwls5Xg_mB2.jpg',
];

(async () => {
  for (const img of images) {
    const url = `https://pxmshare.colgatepalmolive.com/JPEG_1000/${img}`;
    console.log(`\n=== ${img} ===`);
    const desc = await analyzeImage(url);
    console.log(desc);
    
    if (desc?.toLowerCase().includes('salmon')) {
      console.log(`\n*** FOUND SALMON IMAGE: ${url} ***`);
    }
  }
})();
