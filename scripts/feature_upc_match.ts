import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { isNull, sql } from 'drizzle-orm';
import * as fs from 'fs';

const BRAND_PATTERNS: [RegExp, string][] = [
  [/\baqe\b|aqueon/i, 'aqueon'],
  [/\bapi\b/i, 'api'],
  [/\bhik\b|hikari/i, 'hikari'],
  [/\btet\b|tetra/i, 'tetra'],
  [/\bglofsh\b|glofish/i, 'glofish'],
  [/\bkay\b|kaytee/i, 'kaytee'],
  [/\bkng\b|\bkon\b|kong/i, 'kong'],
  [/\bzmd\b|zoo\s*med/i, 'zooMed'],
  [/\bzla\b|zilla/i, 'zilla'],
  [/\bflvl\b|fluval/i, 'fluval'],
  [/\bexo\b|exo\s*terra/i, 'exoTerra'],
  [/\bmrln\b|marineland/i, 'marineland'],
  [/\beth\b|ethical/i, 'ethical'],
  [/\bnyla\b|nylabone/i, 'nylabone'],
  [/\bcstl\b|coastal/i, 'coastal'],
  [/\bflukr\b|fluker/i, 'flukers'],
  [/\bseachem\b|sli\b/i, 'seachem'],
];

const TYPE_PATTERNS: [RegExp, string][] = [
  [/\bfd\b|\bfood\b|\bflk\b|\bflake\b|\bpllt\b|\bpellet\b/i, 'food'],
  [/\btrt\b|\btreat\b/i, 'treat'],
  [/\bfltr\b|\bfilter\b|\bcrtrdg\b|\bcartridge\b/i, 'filter'],
  [/\bhtr\b|\bheater\b/i, 'heater'],
  [/\bpmp\b|\bpump\b/i, 'pump'],
  [/\bornmt\b|\bornament\b|\bdcor\b|\bdecor\b/i, 'decor'],
  [/\bgrvl\b|\bgravel\b|\bsbstrt\b|\bsubstrate\b/i, 'substrate'],
  [/\bled\b|\bfxtr\b|\bfixture\b|\blight\b|\bstrp\b/i, 'lighting'],
  [/\bcond\b|\bconditioner\b|\bstrs\b|\bstress\b/i, 'conditioner'],
  [/\btst\b|\btest\b|\bkit\b/i, 'test'],
  [/\buvb\b|\bbulb\b|\blamp\b|\bbsking\b|\bbasking\b/i, 'bulb'],
  [/\bcage\b|\bknnl\b|\bkennel\b|\bterrm\b|\bterrarium\b/i, 'housing'],
  [/\btoy\b/i, 'toy'],
  [/\blsh\b|\bleash\b|\bcllr\b|\bcollar\b|\bhrns\b|\bharness\b/i, 'collar'],
  [/\bshmp\b|\bshampoo\b/i, 'shampoo'],
  [/\bprch\b|\bperch\b|\bswng\b|\bswing\b/i, 'perch'],
  [/\bseed\b|\bmillet\b/i, 'seed'],
  [/\bhay\b|\btmthy\b|\btimothy\b/i, 'hay'],
  [/\bsplmt\b|\bsupplement\b|\bcal\b|\bcalcium\b|\bvit\b|\bvitamin\b/i, 'supplement'],
];

const SPECIES_PATTERNS: [RegExp, string][] = [
  [/\bcchld\b|\bcichlid\b/i, 'cichlid'],
  [/\bbtta\b|\bbetta\b/i, 'betta'],
  [/\bgld\b|\bgldfsh\b|\bgoldfish\b/i, 'goldfish'],
  [/\btrpcl\b|\btropical\b/i, 'tropical'],
  [/\bfrsw\b|\bfreshwater\b/i, 'freshwater'],
  [/\bmarn\b|\bmarine\b|\bsaltwater\b/i, 'marine'],
  [/\bdg\b|\bdog\b|\bpup\b|\bpuppy\b/i, 'dog'],
  [/\bct\b|\bcat\b|\bktn\b|\bkitten\b/i, 'cat'],
  [/\bprrt\b|\bparrot\b/i, 'parrot'],
  [/\bkeet\b|\bparakeet\b/i, 'parakeet'],
  [/\btiel\b|\bcockatiel\b/i, 'cockatiel'],
  [/\bfnch\b|\bfinch\b/i, 'finch'],
  [/\bhmstr\b|\bhamster\b/i, 'hamster'],
  [/\bgnpg\b|\bguinea\b/i, 'guineaPig'],
  [/\brbbt\b|\brabbit\b/i, 'rabbit'],
  [/\brptl\b|\breptile\b/i, 'reptile'],
];

function extractSize(text: string): string | null {
  const patterns = [
    /(\d+\.?\d*)\s*oz/i, /(\d+\.?\d*)\s*lb/i, /(\d+\.?\d*)\s*#/i,
    /(\d+\.?\d*)\s*gal/i, /(\d+\.?\d*)\s*in/i, /(\d+\.?\d*)\s*ml/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractFeatures(text: string): { brand: string | null; type: string | null; species: string | null; size: string | null } {
  let brand: string | null = null;
  let type: string | null = null;
  let species: string | null = null;
  
  for (const [pattern, name] of BRAND_PATTERNS) {
    if (pattern.test(text)) { brand = name; break; }
  }
  for (const [pattern, name] of TYPE_PATTERNS) {
    if (pattern.test(text)) { type = name; break; }
  }
  for (const [pattern, name] of SPECIES_PATTERNS) {
    if (pattern.test(text)) { species = name; break; }
  }
  
  return { brand, type, species, size: extractSize(text) };
}

async function main() {
  const cleanUpcs: Record<string, string> = JSON.parse(fs.readFileSync('/tmp/clean_upcs.json', 'utf-8'));
  
  const upcs = Object.entries(cleanUpcs)
    .filter(([_, name]) => name.length > 5)
    .map(([upc, name]) => ({ upc, name, features: extractFeatures(name) }));
  
  console.log(`Loaded ${upcs.length} UPCs`);

  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
  }).from(supplies).where(isNull(supplies.sku));
  
  console.log(`Found ${products.length} products without SKU`);

  const matches: { id: number; sku: string; score: number; pName: string; uName: string }[] = [];

  for (const product of products) {
    const pFeatures = extractFeatures(product.name);
    const pBrand = (product.brand || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let best: typeof matches[0] | null = null;

    for (const upc of upcs) {
      let score = 0;
      const uFeatures = upc.features;
      
      if (pFeatures.brand && uFeatures.brand && pFeatures.brand === uFeatures.brand) score += 3;
      else if (pBrand && uFeatures.brand && pBrand.includes(uFeatures.brand.toLowerCase())) score += 3;
      
      if (pFeatures.type && uFeatures.type && pFeatures.type === uFeatures.type) score += 2;
      if (pFeatures.species && uFeatures.species && pFeatures.species === uFeatures.species) score += 2;
      
      if (pFeatures.size && uFeatures.size) {
        if (pFeatures.size === uFeatures.size) score += 2;
        else score -= 3;
      }
      
      if (score >= 5 && (!best || score > best.score)) {
        best = { id: product.id, sku: upc.upc, score, pName: product.name, uName: upc.name };
      }
    }

    if (best) matches.push(best);
  }

  console.log(`\nMatches found: ${matches.length}`);
  
  const byScore = matches.reduce((acc, m) => {
    acc[m.score] = (acc[m.score] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  console.log('By score:', byScore);

  const highConf = matches.filter(m => m.score >= 7);
  console.log(`\nHigh confidence (score >= 7): ${highConf.length}`);
  
  highConf.slice(0, 10).forEach(m => {
    console.log(`  ${m.pName.substring(0, 50)}`);
    console.log(`    -> ${m.uName} (score: ${m.score})`);
  });

  if (highConf.length > 0) {
    console.log('\nApplying high-confidence matches...');
    for (const m of highConf) {
      await db.update(supplies).set({ sku: m.sku }).where(sql`id = ${m.id}`);
    }
  }

  const count = await db.select({ c: sql<number>`count(*)` }).from(supplies).where(sql`sku IS NOT NULL`);
  console.log(`\nFinal coverage: ${count[0].c}/7225 = ${(count[0].c / 7225 * 100).toFixed(1)}%`);
}

main().catch(console.error);
