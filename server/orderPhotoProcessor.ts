import OpenAI from "openai";
import fs from "fs";
import path from "path";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

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
    const prompt = `You are analyzing a photo of an order invoice, receipt, or product list. Extract ALL items with their quantities and prices.

For each item, provide:
1. Item name (full product name)
2. Quantity ordered
3. Unit price (price per single item, not total)
4. Brand name (if visible)
5. Suggested category (food, toys, beds, leashes, healthcare, accessories, aquatics, reptiles, birdSupplies, dogCages, smallAnimalSupplies)

IMPORTANT RULES:
- Extract the UNIT PRICE, not the total price. If you see "2 x $5.00 = $10.00", the unit price is $5.00
- If only total price is shown, divide by quantity to get unit price
- Be thorough - extract every single item visible in the image
- If brand is unclear, leave it empty
- If category is unclear, use "accessories" as default
- Return ONLY valid JSON, no explanations

Return your response in this exact JSON format:
{
  "items": [
    {
      "itemName": "Product Name Here",
      "quantity": 2,
      "unitPrice": 15.99,
      "brand": "BrandName",
      "category": "food",
      "notes": "any special notes"
    }
  ]
}`;

    // Call OpenAI Vision API
    // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
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
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        success: false,
        items: [],
        error: "No response from AI"
      };
    }

    // Parse the JSON response
    const parsedData = JSON.parse(content);
    const items: ExtractedItem[] = parsedData.items || [];

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
