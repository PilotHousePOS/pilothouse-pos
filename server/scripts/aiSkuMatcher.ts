import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, and, isNull, or, sql } from 'drizzle-orm';
import * as fs from 'fs';
import ExcelJS from 'exceljs';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

interface InventoryItem {
  upc: string;
  name: string;
}

// Load inventory from Excel file
async function loadInventory(): Promise<InventoryItem[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('attached_assets/Animal_House_InventoryMaybe_1765838537225.xlsx');
  
  const sheet = workbook.worksheets[0];
  const items: InventoryItem[] = [];
  
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const upc = String(row.getCell(2).value || '').trim();
    const name = String(row.getCell(3).value || '').trim();
    
    if (upc && name && upc.length >= 8) {
      items.push({ upc, name });
    }
  }
  
  return items;
}

// Load Penn Plax products
function loadPennPlax(): InventoryItem[] {
  const content = fs.readFileSync('/tmp/penn_plax_products.txt', 'utf-8');
  const items: InventoryItem[] = [];
  
  for (const line of content.split('\n')) {
    const match = line.match(/^(.+?)\s*\|\|\|(\d{12,14})$/);
    if (match) {
      items.push({
        upc: match[2],
        name: match[1].trim()
      });
    }
  }
  
  return items;
}

// Load Central Pet extracted products
function loadCentralPet(): InventoryItem[] {
  try {
    const products = JSON.parse(fs.readFileSync('/tmp/all_extracted_products.json', 'utf-8'));
    return products.map((p: any) => ({
      upc: p.upc,
      name: p.expandedDesc || p.description
    }));
  } catch {
    return [];
  }
}

// Batch products for AI matching
async function matchWithAI(
  unmatchedSupplies: Array<{ id: number; name: string }>,
  inventoryItems: InventoryItem[],
  usedUpcs: Set<string>
): Promise<Array<{ supplyId: number; supplyName: string; upc: string; inventoryName: string; confidence: number }>> {
  const matches: Array<{ supplyId: number; supplyName: string; upc: string; inventoryName: string; confidence: number }> = [];
  
  // Create inventory lookup string (only unused UPCs)
  const availableInventory = inventoryItems.filter(item => !usedUpcs.has(item.upc));
  
  // Process in batches of 20 supplies at a time
  const batchSize = 20;
  const inventoryBatch = 100; // Compare against top 100 inventory items per batch
  
  console.log(`Processing ${unmatchedSupplies.length} supplies with AI matching...`);
  
  for (let i = 0; i < unmatchedSupplies.length; i += batchSize) {
    const batch = unmatchedSupplies.slice(i, i + batchSize);
    
    // For each supply, find potential matches using simple token overlap first
    for (const supply of batch) {
      const supplyTokens = supply.name.toLowerCase().split(/\s+/);
      
      // Score inventory items by token overlap
      const scored = availableInventory
        .filter(inv => !usedUpcs.has(inv.upc))
        .map(inv => {
          const invTokens = inv.name.toLowerCase().split(/\s+/);
          let score = 0;
          for (const token of supplyTokens) {
            if (token.length > 2 && invTokens.some(t => t.includes(token) || token.includes(t))) {
              score++;
            }
          }
          return { ...inv, score };
        })
        .filter(inv => inv.score >= 1)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      
      if (scored.length === 0) continue;
      
      // Use AI to find the best match
      try {
        const prompt = `You are a product matching expert for a pet store. Match the following product name to the most similar product from the candidate list.

Product to match: "${supply.name}"

Candidates:
${scored.map((s, idx) => `${idx + 1}. ${s.name} (UPC: ${s.upc})`).join('\n')}

Rules:
- Match products that are the same item even if names differ slightly (abbreviations, spelling variations, size differences)
- Look for matching brand, product type, and key identifiers
- Return the candidate number (1-${scored.length}) of the BEST match, or 0 if no good match exists
- Also return confidence level: HIGH (definitely same product), MEDIUM (likely same product), LOW (possibly same product)

Response format (JSON only):
{"match": <number>, "confidence": "<HIGH|MEDIUM|LOW>", "reason": "<brief explanation>"}`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.1
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          const matchIdx = result.match;
          const confidence = result.confidence;
          
          if (matchIdx > 0 && matchIdx <= scored.length && (confidence === 'HIGH' || confidence === 'MEDIUM')) {
            const matched = scored[matchIdx - 1];
            usedUpcs.add(matched.upc);
            matches.push({
              supplyId: supply.id,
              supplyName: supply.name,
              upc: matched.upc,
              inventoryName: matched.name,
              confidence: confidence === 'HIGH' ? 95 : 75
            });
          }
        }
      } catch (error) {
        // Continue on error
      }
    }
    
    if ((i + batchSize) % 100 === 0 || i + batchSize >= unmatchedSupplies.length) {
      console.log(`  Processed ${Math.min(i + batchSize, unmatchedSupplies.length)}/${unmatchedSupplies.length}, found ${matches.length} matches`);
    }
  }
  
  return matches;
}

async function runAIMatcher() {
  console.log('=== AI-Powered SKU Matcher ===\n');
  
  // Load all data sources
  console.log('Loading data sources...');
  const inventory = await loadInventory();
  const pennPlax = loadPennPlax();
  const centralPet = loadCentralPet();
  
  // Combine all inventory
  const allInventory: InventoryItem[] = [];
  const seenUpcs = new Set<string>();
  
  for (const item of [...inventory, ...pennPlax, ...centralPet]) {
    if (!seenUpcs.has(item.upc)) {
      seenUpcs.add(item.upc);
      allInventory.push(item);
    }
  }
  
  console.log(`Combined inventory: ${allInventory.length} unique UPCs\n`);
  
  // Get supplies without SKU
  const unmatchedSupplies = await db.select({ id: supplies.id, name: supplies.name })
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`${unmatchedSupplies.length} supplies need SKU matching\n`);
  
  // Get already used SKUs
  const existingSkus = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const usedUpcs = new Set(existingSkus.map(s => s.sku!));
  console.log(`${usedUpcs.size} SKUs already in use\n`);
  
  // Run AI matching
  const matches = await matchWithAI(unmatchedSupplies, allInventory, usedUpcs);
  
  console.log(`\nApplying ${matches.length} AI-matched SKUs...`);
  
  // Apply matches
  const matchLog: string[] = [];
  for (const match of matches) {
    await db.update(supplies)
      .set({ sku: match.upc })
      .where(eq(supplies.id, match.supplyId));
    
    matchLog.push(`[AI ${match.confidence}%] "${match.supplyName}" -> "${match.inventoryName}" (${match.upc})`);
  }
  
  // Save log
  fs.writeFileSync('/tmp/ai_match_log.txt', matchLog.join('\n'));
  
  // Final counts
  const finalWithSku = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const finalTotal = await db.select({ count: sql<number>`count(*)` })
    .from(supplies);
  
  const withSkuCount = Number(finalWithSku[0].count);
  const totalCount = Number(finalTotal[0].count);
  const coverage = ((withSkuCount / totalCount) * 100).toFixed(1);
  
  console.log('\n=== RESULTS ===');
  console.log(`AI matches: ${matches.length}`);
  console.log(`Final SKU coverage: ${withSkuCount}/${totalCount} (${coverage}%)`);
}

runAIMatcher().catch(console.error);
