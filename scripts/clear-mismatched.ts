import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';
import fs from 'fs';

interface UpcEntry { upc: string; name: string; }

const brandDetectors = [
  { brand: 'Zoo Med', patterns: [/zoo\s*med/i, /^zml\b/i, /^zm\s/i, /zoomed/i] },
  { brand: 'Fluval', patterns: [/fluval/i, /^flu\s/i, /^fluv/i] },
  { brand: 'Exo Terra', patterns: [/exo[- ]?terra/i, /^et\s/i, /^ext\s/i, /exoterra/i] },
  { brand: 'Coastal', patterns: [/coastal/i, /^coa\s/i] },
  { brand: 'Zilla', patterns: [/zilla/i, /^zil\s/i, /^zl\s/i] },
  { brand: 'Tetra', patterns: [/tetra/i, /^te[t]?\s/i, /^tet\s/i] },
  { brand: 'Prevue', patterns: [/prevue/i] },
  { brand: 'Ace', patterns: [/^ace\s/i] },
  { brand: 'Marineland', patterns: [/marineland/i, /marina/i] },
  { brand: 'Nutro', patterns: [/nutro/i] },
  { brand: 'Lix', patterns: [/^lix\s/i] },
  { brand: 'Mndys', patterns: [/^mndys\s/i] },
  { brand: 'MPI', patterns: [/^mpi\s/i] },
  { brand: 'AP', patterns: [/^ap\s/i] },
  { brand: 'AJ', patterns: [/^aj\s/i] },
  { brand: 'PTS', patterns: [/^pts\s/i] },
  { brand: 'TER', patterns: [/^ter\s/i] },
  { brand: 'MPF', patterns: [/^mpf\s/i] },
];

function detectBrand(upcName: string): string | null {
  for (const { brand, patterns } of brandDetectors) {
    for (const pattern of patterns) {
      if (pattern.test(upcName)) return brand;
    }
  }
  return null;
}

function normBrand(brand: string): string {
  const b = brand.toLowerCase();
  if (b.includes('penn')) return 'Penn-Plax';
  if (b.includes('lil') || b.includes("li'l")) return "Li'l Pals";
  if (b.includes('zoo')) return 'Zoo Med';
  if (b.includes('fluval')) return 'Fluval';
  if (b.includes('exo')) return 'Exo Terra';
  return brand;
}

async function main() {
  const upcData: UpcEntry[] = JSON.parse(fs.readFileSync('.local/state/memory/merged_upc_database.json', 'utf-8'));
  const upcMap = new Map<string, string>();
  for (const e of upcData) {
    upcMap.set(e.upc, e.name);
  }
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies);
  
  const targetBrands = ['Penn-Plax', "Li'l Pals", 'Zoo Med', 'Fluval', 'Exo Terra'];
  const targetProducts = products.filter(p => 
    p.sku && p.sku.length >= 10 && 
    targetBrands.includes(normBrand(p.brand || ''))
  );
  
  let cleared = 0;
  const toClear: number[] = [];
  
  for (const p of targetProducts) {
    const upcName = upcMap.get(p.sku!);
    if (!upcName) continue;
    
    const detectedBrand = detectBrand(upcName);
    const productBrand = normBrand(p.brand || '');
    
    if (detectedBrand && detectedBrand !== productBrand) {
      toClear.push(p.id);
      if (cleared < 15) {
        console.log(`Mismatch: "${p.name}" (${productBrand}) <- "${upcName}" (${detectedBrand})`);
      }
      cleared++;
    }
  }
  
  if (toClear.length > 0) {
    console.log(`\nClearing ${toClear.length} mismatched UPCs...`);
    for (const id of toClear) {
      await db.update(supplies).set({ sku: null }).where(sql`${supplies.id} = ${id}`);
    }
  }
  
  const final = await db.select({ id: supplies.id, sku: supplies.sku }).from(supplies);
  const withUpc = final.filter(p => p.sku?.length >= 10).length;
  console.log(`\nCoverage: ${withUpc}/${final.length} (${(withUpc/final.length*100).toFixed(1)}%)`);
  
  process.exit(0);
}

main().catch(console.error);
