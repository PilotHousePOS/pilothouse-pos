import OpenAI from "openai";
import { db } from "../db";
import { supplies } from "@shared/schema";
import { eq, or, ilike } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function analyzeProductColor(
  productName: string,
  imageUrl: string
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Look at this NutriSource pet food product image. What is the predominant accent color or band color on the packaging? 

Product: ${productName}

Focus on the main color accent that distinguishes this product variant. Common colors include: Red, Orange, Purple, Blue, Brown, Burgundy, Green, Yellow, Pink.

Respond with ONLY the color name (one word), nothing else.`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 50,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (content) {
      // Normalize the color name
      const normalizedColor = content.split(/\s+/)[0].replace(/[^a-zA-Z]/g, '');
      return normalizedColor.charAt(0).toUpperCase() + normalizedColor.slice(1).toLowerCase();
    }
    return "";
  } catch (error) {
    console.error(`Error analyzing image for ${productName}:`, error);
    return "";
  }
}

async function main() {
  console.log("Starting NutriSource AI Vision Color Detection...\n");
  
  const products = await db
    .select({
      id: supplies.id,
      name: supplies.name,
      imageUrl: supplies.imageUrl,
      imageUrls: supplies.imageUrls,
      color: supplies.color,
    })
    .from(supplies)
    .where(
      or(
        ilike(supplies.brand, "%nutrisource%"),
        ilike(supplies.name, "%nutrisource%")
      )
    )
    .orderBy(supplies.name);

  console.log(`Found ${products.length} NutriSource products\n`);
  
  let updated = 0;
  let errors = 0;

  // Get base URL from environment or use default
  const baseUrl = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://animal-house-pet-store.replit.app";

  for (const product of products) {
    let imageUrl = product.imageUrl || (product.imageUrls && product.imageUrls[0]);
    
    if (!imageUrl) {
      console.log(`  [${product.id}] No image for: ${product.name}`);
      continue;
    }
    
    // Convert relative paths to full URLs
    if (imageUrl.startsWith("/")) {
      imageUrl = `${baseUrl}${imageUrl}`;
    } else if (!imageUrl.startsWith("http")) {
      console.log(`  [${product.id}] Invalid image path for: ${product.name}`);
      continue;
    }

    console.log(`  [${product.id}] Analyzing: ${product.name}`);
    const color = await analyzeProductColor(product.name, imageUrl);
    
    if (color) {
      await db
        .update(supplies)
        .set({ color })
        .where(eq(supplies.id, product.id));
      
      console.log(`      -> ${color}`);
      updated++;
    } else {
      console.log(`      -> Failed to detect color`);
      errors++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
