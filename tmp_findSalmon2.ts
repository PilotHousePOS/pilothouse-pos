import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

async function verifyImage(imageUrl: string) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `Look at this cat food product image. What FLAVOR is shown? Is it Salmon, Chicken, or Tuna? If it shows a food can, what flavor is on the label? Reply with just the flavor like "Salmon" or "Chicken" or "Unknown" if you can't tell.` 
          },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 50
    });
    
    return response.choices[0]?.message?.content;
  } catch (e: any) {
    return 'Error: ' + e.message;
  }
}

// Check the new images specific to the Salmon page
const newImages = [
  '2Hw6GmseL5AVvDyG_xlRg.jpg',
  'hwGdW595odT8a89WmNqyi.jpg',
  'rlwOiAkyMtQIpf-9lnlLJ.jpg',
  'rundLw9Ru2js21y2Jcv_z.jpg',
  'vvZIzWPcHBLwls5Xg_mB2.jpg',
];

(async () => {
  for (const img of newImages) {
    const url = `https://pxmshare.colgatepalmolive.com/JPEG_1000/${img}`;
    const flavor = await verifyImage(url);
    console.log(`${img}: ${flavor}`);
    if (flavor?.toLowerCase().includes('salmon')) {
      console.log(`\n*** FOUND SALMON IMAGE: ${url} ***\n`);
    }
  }
})();
