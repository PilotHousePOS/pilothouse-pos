import { db } from '../db';
import { supplies } from '@shared/schema';
import { eq, isNull, or, sql } from 'drizzle-orm';
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

async function loadAllInventory(): Promise<InventoryItem[]> {
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
  
  // Add Penn Plax
  const pennPlax = fs.readFileSync('/tmp/penn_plax_products.txt', 'utf-8');
  for (const line of pennPlax.split('\n')) {
    const match = line.match(/^(.+?)\s*\|\|\|(\d{12,14})$/);
    if (match) {
      items.push({ upc: match[2], name: match[1].trim() });
    }
  }
  
  // Add Central Pet
  try {
    const products = JSON.parse(fs.readFileSync('/tmp/all_extracted_products.json', 'utf-8'));
    for (const p of products) {
      items.push({ upc: p.upc, name: p.expandedDesc || p.description });
    }
  } catch {}
  
  return items;
}

async function matchBatch(
  supplyBatch: Array<{ id: number; name: string }>,
  inventory: InventoryItem[],
  usedUpcs: Set<string>
): Promise<Array<{ supplyId: number; upc: string; confidence: string }>> {
  
  // Create inventory string with only unused UPCs
  const availableInv = inventory.filter(i => !usedUpcs.has(i.upc));
  
  // Build prompt for batch matching
  const suppliesList = supplyBatch.map((s, i) => `${i + 1}. "${s.name}"`).join('\n');
  
  // For each supply, find top candidates
  const candidatesPerSupply: string[] = [];
  for (const supply of supplyBatch) {
    const tokens = supply.name.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const scored = availableInv
      .map(inv => {
        const invTokens = inv.name.toLowerCase().split(/\s+/);
        let score = 0;
        for (const t of tokens) {
          if (invTokens.some(it => it.includes(t) || t.includes(it))) score++;
        }
        return { ...inv, score };
      })
      .filter(inv => inv.score >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    if (scored.length > 0) {
      candidatesPerSupply.push(scored.map(s => `${s.name} (${s.upc})`).join(' | '));
    } else {
      candidatesPerSupply.push('NO CANDIDATES');
    }
  }
  
  const prompt = `Match these pet store products to their inventory entries. Return JSON array with matches.

PRODUCTS TO MATCH:
${supplyBatch.map((s, i) => `${i + 1}. "${s.name}" -> Candidates: ${candidatesPerSupply[i]}`).join('\n')}

For each product, return: {"idx": <1-${supplyBatch.length}>, "upc": "<matched UPC or null>", "conf": "HIGH|MED|LOW"}
Only match if confident. Return array of matches.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]);
      return results
        .filter((r: any) => r.upc && r.upc !== 'null' && (r.conf === 'HIGH' || r.conf === 'MED'))
        .map((r: any) => ({
          supplyId: supplyBatch[r.idx - 1]?.id,
          upc: r.upc,
          confidence: r.conf
        }))
        .filter((r: any) => r.supplyId && !usedUpcs.has(r.upc));
    }
  } catch (e) {
    console.log('Batch error:', e);
  }
  
  return [];
}

async function run() {
  console.log('=== Fast AI Matcher ===\n');
  
  const inventory = await loadAllInventory();
  console.log(`Loaded ${inventory.length} inventory items\n`);
  
  // Dedupe inventory
  const uniqueInv: InventoryItem[] = [];
  const seen = new Set<string>();
  for (const item of inventory) {
    if (!seen.has(item.upc)) {
      seen.add(item.upc);
      uniqueInv.push(item);
    }
  }
  console.log(`${uniqueInv.length} unique UPCs\n`);
  
  // Get unmatched supplies
  const unmatched = await db.select({ id: supplies.id, name: supplies.name })
    .from(supplies)
    .where(or(isNull(supplies.sku), eq(supplies.sku, '')));
  
  console.log(`${unmatched.length} supplies need matching\n`);
  
  // Get used UPCs
  const existing = await db.select({ sku: supplies.sku })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const usedUpcs = new Set(existing.map(s => s.sku!));
  console.log(`${usedUpcs.size} UPCs already used\n`);
  
  // Process in batches of 10
  const batchSize = 10;
  let totalMatches = 0;
  const matchLog: string[] = [];
  
  for (let i = 0; i < unmatched.length; i += batchSize) {
    const batch = unmatched.slice(i, i + batchSize);
    const matches = await matchBatch(batch, uniqueInv, usedUpcs);
    
    for (const match of matches) {
      if (!usedUpcs.has(match.upc)) {
        await db.update(supplies)
          .set({ sku: match.upc })
          .where(eq(supplies.id, match.supplyId));
        
        usedUpcs.add(match.upc);
        totalMatches++;
        
        const supply = batch.find(b => b.id === match.supplyId);
        matchLog.push(`[${match.confidence}] "${supply?.name}" -> ${match.upc}`);
      }
    }
    
    if ((i + batchSize) % 100 === 0) {
      console.log(`Processed ${i + batchSize}/${unmatched.length}, ${totalMatches} matches`);
    }
  }
  
  fs.writeFileSync('/tmp/fast_ai_matches.txt', matchLog.join('\n'));
  
  // Final count
  const final = await db.select({ count: sql<number>`count(*)` })
    .from(supplies)
    .where(sql`sku IS NOT NULL AND sku != ''`);
  
  const total = await db.select({ count: sql<number>`count(*)` })
    .from(supplies);
  
  const coverage = (Number(final[0].count) / Number(total[0].count) * 100).toFixed(1);
  
  console.log(`\n=== RESULTS ===`);
  console.log(`New matches: ${totalMatches}`);
  console.log(`Coverage: ${final[0].count}/${total[0].count} (${coverage}%)`);
}

run().catch(console.error);
