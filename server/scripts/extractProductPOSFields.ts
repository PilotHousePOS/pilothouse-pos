import OpenAI from "openai";
import { db } from "../db";
import { supplies } from "@shared/schema";
import { eq, or, ilike, isNull, sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface POSFields {
  color: string;
  size: string;
  style: string;
}

async function analyzeProductImage(
  productName: string,
  imageUrl: string,
  brand: string
): Promise<POSFields> {
  try {
    const brandPrompt = brand.toLowerCase().includes("science diet") || brand.toLowerCase().includes("hill")
      ? `For Hill's Science Diet products:
        - Puppy products have a GREEN band on top
        - Regular adult products have a RED band on top
        - Senior (7+, 11+) adult products have a RED band on top
        - Specialty/prescription products have a SILVER/GRAY band on top
        - Kitten products may have a TEAL/TURQUOISE band
        Look at the colored band at the TOP of the can or bag.`
      : brand.toLowerCase().includes("nutrisource")
      ? `For NutriSource products:
        - Lamb formula = ORANGE band/accent
        - Large Breed Puppy = PURPLE band/accent
        - Chicken = RED/MAROON band/accent
        - Beef = BROWN band/accent
        - Fish/Salmon = BLUE band/accent
        - Turkey = BURGUNDY band/accent
        Look at the primary accent color on the packaging.`
      : `Look at the primary color accent or band on the product packaging.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this pet food product image for a POS (Point of Sale) system.

Product Name: ${productName}
Brand: ${brand}

${brandPrompt}

Extract the following information:

1. COLOR: What is the primary color band or accent color on the TOP of the can/bag? (e.g., Red, Green, Purple, Orange, Silver, Blue, Teal). This is used for ExaTouch POS color field.

2. SIZE: What is the product size? Extract from the packaging or product name (e.g., 5lb, 15lb, 5.8oz, 13oz, 3.5oz).

3. STYLE: What is the product style/variant? This includes:
   - Life stage (Puppy, Adult, Senior, 7+, 11+, Kitten)
   - Protein/flavor (Chicken, Beef, Salmon, Lamb, Turkey)
   - Special features (Small Bite, Large Breed, Indoor, Hairball Control)
   - Format (Dry, Wet, Stew, Pate)

Respond in JSON format:
{
  "color": "the color band/accent color",
  "size": "the product size",
  "style": "the product style/variant description"
}`,
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
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);
    return {
      color: parsed.color || "",
      size: parsed.size || "",
      style: parsed.style || "",
    };
  } catch (error) {
    console.error(`Error analyzing image for ${productName}:`, error);
    return { color: "", size: "", style: "" };
  }
}

function extractSizeFromName(name: string): string {
  const sizeMatch = name.match(/(\d+(?:\.\d+)?)\s*(lb|oz|kg|g)\b/i);
  if (sizeMatch) {
    return `${sizeMatch[1]}${sizeMatch[2].toLowerCase()}`;
  }
  return "";
}

function extractStyleFromName(name: string, brand: string): string {
  const parts: string[] = [];
  
  // Life stage
  if (/puppy/i.test(name)) parts.push("Puppy");
  else if (/kitten/i.test(name)) parts.push("Kitten");
  else if (/11\+/i.test(name)) parts.push("Senior 11+");
  else if (/7\+/i.test(name)) parts.push("Senior 7+");
  else if (/adult/i.test(name)) parts.push("Adult");
  
  // Protein/flavor
  if (/chicken/i.test(name)) parts.push("Chicken");
  if (/beef/i.test(name)) parts.push("Beef");
  if (/lamb/i.test(name)) parts.push("Lamb");
  if (/salmon/i.test(name)) parts.push("Salmon");
  if (/turkey/i.test(name)) parts.push("Turkey");
  if (/tuna/i.test(name)) parts.push("Tuna");
  if (/fish/i.test(name)) parts.push("Fish");
  
  // Special features
  if (/small bite/i.test(name)) parts.push("Small Bite");
  if (/large breed/i.test(name)) parts.push("Large Breed");
  if (/indoor/i.test(name)) parts.push("Indoor");
  if (/hairball/i.test(name)) parts.push("Hairball Control");
  if (/sensitive/i.test(name)) parts.push("Sensitive");
  if (/weight/i.test(name)) parts.push("Weight Management");
  if (/light/i.test(name)) parts.push("Light");
  if (/urinary/i.test(name)) parts.push("Urinary");
  
  // Format
  if (/stew/i.test(name)) parts.push("Stew");
  if (/pate/i.test(name)) parts.push("Pate");
  
  return parts.join(" ");
}

async function processProducts(brandFilter: string, batchSize: number = 10) {
  console.log(`\n=== Processing ${brandFilter} products ===\n`);
  
  const products = await db
    .select({
      id: supplies.id,
      name: supplies.name,
      brand: supplies.brand,
      imageUrl: supplies.imageUrl,
      imageUrls: supplies.imageUrls,
      color: supplies.color,
      size: supplies.size,
      style: supplies.style,
    })
    .from(supplies)
    .where(
      or(
        ilike(supplies.brand, `%${brandFilter}%`),
        ilike(supplies.name, `%${brandFilter}%`)
      )
    )
    .orderBy(supplies.name);

  console.log(`Found ${products.length} ${brandFilter} products`);
  
  let processed = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    
    const promises = batch.map(async (product) => {
      try {
        const imageUrl = product.imageUrl || (product.imageUrls && product.imageUrls[0]);
        
        if (!imageUrl) {
          console.log(`  [${product.id}] No image available for: ${product.name}`);
          return null;
        }

        // Extract size and style from name as fallback
        const sizeFromName = extractSizeFromName(product.name);
        const styleFromName = extractStyleFromName(product.name, product.brand || "");

        let posFields: POSFields = {
          color: "",
          size: sizeFromName,
          style: styleFromName,
        };

        // Use AI vision to analyze image for color
        if (imageUrl.startsWith("http")) {
          console.log(`  [${product.id}] Analyzing: ${product.name}`);
          const aiFields = await analyzeProductImage(
            product.name,
            imageUrl,
            product.brand || ""
          );
          
          // Merge AI results with name-based extraction (AI takes precedence if available)
          posFields = {
            color: aiFields.color || "",
            size: aiFields.size || sizeFromName,
            style: aiFields.style || styleFromName,
          };
        }

        // Update database
        if (posFields.color || posFields.size || posFields.style) {
          await db
            .update(supplies)
            .set({
              color: posFields.color || product.color || null,
              size: posFields.size || product.size || null,
              style: posFields.style || product.style || null,
            })
            .where(eq(supplies.id, product.id));

          console.log(`  [${product.id}] Updated: Color=${posFields.color}, Size=${posFields.size}, Style=${posFields.style}`);
          return { success: true, updated: true };
        }

        return { success: true, updated: false };
      } catch (error) {
        console.error(`  [${product.id}] Error processing ${product.name}:`, error);
        return { success: false, error };
      }
    });

    const results = await Promise.all(promises);
    
    results.forEach((result) => {
      if (result) {
        processed++;
        if (result.success && result.updated) updated++;
        if (!result.success) errors++;
      }
    });

    console.log(`\nProgress: ${processed}/${products.length} processed, ${updated} updated, ${errors} errors\n`);
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < products.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n=== ${brandFilter} Processing Complete ===`);
  console.log(`Total: ${processed} processed, ${updated} updated, ${errors} errors\n`);
  
  return { processed, updated, errors };
}

async function main() {
  console.log("Starting POS Field Extraction using AI Vision...\n");
  
  // Process Science Diet products
  const scienceDietResults = await processProducts("science diet", 5);
  
  // Process NutriSource products
  const nutriSourceResults = await processProducts("nutrisource", 5);
  
  console.log("\n=== FINAL SUMMARY ===");
  console.log(`Science Diet: ${scienceDietResults.updated} products updated`);
  console.log(`NutriSource: ${nutriSourceResults.updated} products updated`);
  console.log(`Total updated: ${scienceDietResults.updated + nutriSourceResults.updated}`);
}

main().catch(console.error);
