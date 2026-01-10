import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
});

async function verifyImage(imageUrl: string) {
  console.log(`Analyzing: ${imageUrl}`);
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { 
          type: 'text', 
          text: `Look at this cat food product image. What FLAVOR is shown? What is the EXACT product name visible on the can? Is this Salmon, Chicken, Tuna, or another flavor? Reply with just the flavor and product name you see.` 
        },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }],
    max_tokens: 200
  });
  
  console.log('Result:', response.choices[0]?.message?.content);
}

// Check the current wrong image (ID 6851)
const wrongImage = 'https://pxmshare.colgatepalmolive.com/JPEG_1000/Nrwa_gzvNK5ku5uy3I-gs.jpg';
verifyImage(wrongImage);
