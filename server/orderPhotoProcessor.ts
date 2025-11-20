import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { pdf } from "pdf-to-img";

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
    let imageBuffer: Buffer;
    let mimeType = getMimeType(imagePath);
    
    // If it's a PDF, convert first page to PNG image
    if (mimeType === 'application/pdf') {
      console.log("Converting PDF to image...");
      const document = await pdf(imagePath, { scale: 3 }); // Higher scale for better quality
      let firstPage: Buffer | null = null;
      
      for await (const page of document) {
        firstPage = page;
        break; // Only get first page
      }
      
      if (!firstPage) {
        throw new Error("Failed to extract page from PDF");
      }
      
      imageBuffer = firstPage;
      mimeType = 'image/png';
      console.log("PDF converted to PNG successfully");
    } else {
      // Read the image file directly
      imageBuffer = fs.readFileSync(imagePath);
    }
    
    const base64Image = imageBuffer.toString('base64');

    // Prepare the prompt for OpenAI Vision
    const prompt = `You are analyzing a photo of a SUPPLIER ORDER INVOICE for a pet store. This document shows a table with the following columns from LEFT TO RIGHT:

Column 1: "Item" - The product name
Column 2: "Unit Cost" - The price for ONE unit (e.g., $2.13, $1.82, $4.20)
Column 3: "Qty" - Quantity ordered (usually 12, 25, 30, 50, etc.)
Column 4: "Qty Shipped" - Quantity shipped
Column 5: "Item Total" - The total price (DO NOT USE THIS - we need Unit Cost only)

YOUR TASK:
1. Extract EVERY row from this table
2. For each row, read: Item Name (column 1), Unit Cost (column 2), and Qty (column 3)
3. The Unit Cost column contains dollar amounts like $2.13, $1.82, $4.20 - READ THESE CAREFULLY
4. Extract the numeric value from Unit Cost (e.g., "$2.13" becomes 2.13)

CRITICAL EXTRACTION RULES:
- Read the "Unit Cost" column (second column) very carefully - it shows prices like $2.13, $1.82, $4.20, etc.
- DO NOT use the "Item Total" column (last column) - that's the total price, not unit price
- If you cannot read a specific Unit Cost value, look more carefully - they are visible in the image
- For aquatic/fish products (Swordtails, Tetras, Cichlids, Guppies, Mollies, Plecos, etc.), use category "aquatics"
- Extract ALL rows - this invoice likely has 50-80+ items

EXAMPLE ROW from the invoice:
Visual: "Marble Swordtail Reg    $2.13    12    12    $25.56"
Extract as: {"itemName": "Marble Swordtail Reg", "quantity": 12, "unitPrice": 2.13, "category": "aquatics", "brand": "", "notes": ""}

Return ONLY valid JSON in this EXACT format:
{
  "items": [
    {
      "itemName": "Marble Swordtail Reg",
      "quantity": 12,
      "unitPrice": 2.13,
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
    '.webp': 'image/webp',
    '.pdf': 'application/pdf'
  };
  return mimeTypes[ext] || 'image/jpeg';
}
