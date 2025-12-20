import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';
import * as fs from 'fs';

function normalize(s: string): string {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const abbrToFull: Record<string, string> = {
  'sd': 'science diet', 'tow': 'taste of the wild', 'totw': 'taste of the wild',
  'kon': 'kong', 'kng': 'kong', 'nyl': 'nylabone', 'zil': 'zilla',
  'flu': 'fluker', 'gre': 'greenies', 'iam': 'iams', 'mw': 'midwest',
  'rb': 'redbarn', 'rbp': 'redbarn', 'eth': 'ethical', 'kay': 'kaytee',
  'tet': 'tetra', 'hik': 'hikari', 'api': 'api', 'aqe': 'aqueon',
  'fou': 'four paws', 'tro': 'tropiclean', 've': 'vital essentials',
};

async function main() {
  // Get some unmatched Science Diet products
  const noSku = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand
  }).from(supplies).where(isNull(supplies.sku));
  
  const sdProducts = noSku.filter(p => p.brand === 'Science Diet').slice(0, 10);
  
  console.log('=== Unmatched Science Diet Products ===');
  for (const p of sdProducts) {
    console.log(`  "${p.name}" -> normalized: "${normalize(p.name)}"`);
  }
  
  // Check what SD entries exist in sources
  console.log('\n=== SD entries in invoices ===');
  const inv = fs.readFileSync('.local/state/memory/all_invoice_upcs.txt', 'utf-8');
  const sdInvoices = inv.split('\n').filter(l => l.toLowerCase().includes('|sd '));
  for (const line of sdInvoices.slice(0, 15)) {
    const parts = line.split('|');
    if (parts.length >= 3) {
      const desc = parts[2];
      const expanded = desc.toLowerCase().replace(/^sd\s+/i, 'science diet ');
      console.log(`  "${desc}" -> "${expanded}"`);
    }
  }
  
  // Check Google Sheet for SD
  console.log('\n=== SD entries in Google Sheet ===');
  const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
  const sdGoogle = csv.split('\n').filter(l => l.toLowerCase().includes(',sd '));
  for (const line of sdGoogle.slice(0, 10)) {
    console.log(`  ${line}`);
  }
  
  // Check Excel for SD  
  console.log('\n=== Checking if we can match specific product ===');
  const testProduct = 'Science Diet Cat Urinary & Hairball Control 15.5lb';
  const testNorm = normalize(testProduct);
  console.log(`Looking for: "${testNorm}"`);
  
  // Search all sources for anything similar
  const allInv = inv.split('\n').filter(l => 
    l.toLowerCase().includes('urinary') || l.toLowerCase().includes('hairball')
  );
  console.log(`\nInvoice entries with urinary/hairball:`);
  for (const line of allInv) {
    console.log(`  ${line}`);
  }
}

main().catch(console.error);
