import OpenAI from "openai";
import fs from "fs";
import path from "path";

// Lazy initialization of OpenAI client to prevent startup crashes if credentials aren't configured
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    // This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    // Note: AI_INTEGRATIONS_OPENAI_API_KEY is a dummy value for SDK compatibility - don't check if it exists
    openaiClient = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    });
  }
  return openaiClient;
}

export interface ExtractedItem {
  itemName: string;
  quantity: number;
  unitPrice: number;
  brand?: string;
  category?: string;
  notes?: string;
}

export interface OrderExtractionResult {
  success: boolean;
  items: ExtractedItem[];
  rawResponse?: string;
  error?: string;
}

/**
 * Extract order items from an uploaded photo using OpenAI Vision
 * @param imagePath - Local file path to the uploaded order photo
 * @returns Extracted items with quantities and base unit prices (markup should be applied by caller)
 */
export async function extractOrderFromPhoto(
  imagePath: string
): Promise<OrderExtractionResult> {
  try {
    // Read the image file and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(imagePath);

    // Prepare the prompt for OpenAI Vision
    const prompt = `You are analyzing a photo of a SUPPLIER ORDER INVOICE or PRODUCT LIST for a pet store. This is a table/list of products with prices.

CRITICAL: You MUST extract EVERY SINGLE LINE ITEM visible in the document. Look for tables, lists, or rows of products.

For each product line, extract:
1. Item name (the product name, e.g., "Marble Swordtail Reg", "Black Highfin Lyretail Reg")
2. Quantity (how many units ordered - look for "Qty" column)
3. Unit Cost/Price (the price PER UNIT - look for "Unit Cost" column, NOT the total)
4. Brand name (if visible, otherwise empty string)
5. Category - choose from: food, toys, beds, leashes, healthcare, accessories, aquatics, reptiles, birdSupplies, dogCages, smallAnimalSupplies

CRITICAL INSTRUCTIONS:
- This is typically a TABULAR format with columns: Item Name, Unit Cost, Quantity, Total
- Extract the UNIT COST/UNIT PRICE column (not the total)
- If you see 50+ products, extract ALL of them - don't skip any
- For aquatic/fish products, use category "aquatics"
- For reptile products, use category "reptiles"
- If unclear, use "accessories"
- DO NOT return an empty items array - if you see a product list, extract it!

Example of what you might see:
"Marble Swordtail Reg    $2.13    12    $25.56"
Should become: {"itemName": "Marble Swordtail Reg", "quantity": 12, "unitPrice": 2.13, "category": "aquatics"}

Return ONLY valid JSON in this EXACT format (no markdown, no explanations):
{
  "items": [
    {
      "itemName": "Product Name Here",
      "quantity": 2,
      "unitPrice": 15.99,
      "brand": "",
      "category": "aquatics",
      "notes": ""
    }
  ]
}`;

    // Call OpenAI Vision API
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    const openai = getOpenAIClient();
    
    console.log(`Processing image: ${imagePath}`);
    console.log(`Image size: ${imageBuffer.length} bytes`);
    console.log(`MIME type: ${mimeType}`);
    console.log(`Base64 length: ${base64Image.length} characters`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    });

    console.log("=== OpenAI Vision Response ===");
    console.log("Full response:", JSON.stringify(response, null, 2));
    const content = response.choices[0]?.message?.content;
    console.log("Raw content:", content);
    
    if (!content) {
      console.log("ERROR: No content in response");
      return {
        success: false,
        items: [],
        error: "No response from AI"
      };
    }

    // Parse the JSON response
    let parsedData;
    try {
      parsedData = JSON.parse(content);
      console.log("Parsed data:", JSON.stringify(parsedData, null, 2));
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return {
        success: false,
        items: [],
        error: "Failed to parse AI response"
      };
    }
    
    const items: ExtractedItem[] = parsedData.items || [];
    console.log(`Extracted ${items.length} items from AI response`);

    // Apply price multiplier to create marked-up prices
    const processedItems = items.map(item => ({
      ...item,
      unitPrice: parseFloat(item.unitPrice.toString()), // Ensure it's a number
      quantity: parseInt(item.quantity.toString(), 10) || 1
    }));

    return {
      success: true,
      items: processedItems,
      rawResponse: content
    };

  } catch (error: any) {
    console.error("Error extracting order from photo:", error);
    return {
      success: false,
      items: [],
      error: error.message || "Failed to process image"
    };
  }
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
}
