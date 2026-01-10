import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

async function verifyImage(imageUrl: string, label: string) {
  console.log(`\nAnalyzing ${label}...`);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `Look at this cat food product image. What FLAVOR is shown on the can (Salmon, Chicken, Tuna, etc.)? Reply with just the flavor, like "Salmon" or "Chicken".` 
          },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      max_tokens: 50
    });
    
    console.log(`${imageUrl.split('/').pop()}: ${response.choices[0]?.message?.content}`);
  } catch (e: any) {
    console.log('Error:', e.message);
  }
}

// Check all images from the Hill's shop page
const images = [
  '7puBPpE8bspN1EhlZ7tJP.jpg',
  'wHzBN7e8VOxK0U1zuSLNm.jpg',
  'mCttDy-0LfZS5KLSIrWpo.jpg',
  '172sDqIQwK-s0WQR6irVW.jpg',
  '0Yt6hTrvrrRRr2maRayg0.jpg',
];

(async () => {
  for (const img of images) {
    const url = `https://pxmshare.colgatepalmolive.com/JPEG_1000/${img}`;
    await verifyImage(url, img);
  }
})();
