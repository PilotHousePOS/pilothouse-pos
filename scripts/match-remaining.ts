import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNull } from 'drizzle-orm';

const brandAbbr: Record<string, string[]> = {
  'science diet': ['sd', 'scidiet', 'hill', 'hills'],
  'blue buffalo': ['bb', 'bluebuff', 'blue buff'],
  'royal canin': ['rc', 'royalc', 'royal can'],
  'diamond': ['diam'], 'kong': ['kon', 'kng'], 'zilla': ['zil'],
  'zoo med': ['zm', 'zoomed'], 'exo terra': ['et', 'exoterra'],
  'tetra': ['tet'], 'hikari': ['hik'], 'aqueon': ['aqe'],
  'coastal': ['cst'], 'kaytee': ['kay', 'kt'], 'fromm': ['frm'],
  'nutrisource': ['ns', 'nutri sour'], 'redbarn': ['rb', 'red b'],
  'orijen': ['orj'], 'acana': ['ac'], 'victor': ['vic'],
  'pro plan': ['pp', 'proplan'], 'natural balance': ['nb'],
  'taste of the wild': ['tow', 'totw'], 'wellness': ['well'],
  'merrick': ['mer'], 'canidae': ['can'], 'nutro': ['nut'],
  'fluval': ['fluv'], 'seachem': ['sli'], 'api': ['api'],
  'oxbow': ['ox', 'oxb'], 'prevue': ['prev', 'pv'],
  'a & e': ['ae', 'a&e'], 'marshall': ['marsh'],
  'greenies': ['grn'], 'nylabone': ['nyla'], 'busy bone': ['busy'],
  'milk bone': ['milkb'], 'pedigree': ['ped'], 'purina': ['pur'],
  'iams': ['iam'], 'eukanuba': ['euk'], 'cesar': ['ces'],
  'beneful': ['ben'], 'bil jac': ['bilj'], 'rachael ray': ['rr'],
};

const wordAbbr: Record<string, string[]> = {
  'small': ['sm', 'sml'], 'medium': ['md', 'med'], 'large': ['lg', 'lrg'],
  'extra large': ['xl', 'xlg'], 'breed': ['br', 'brd'],
  'chicken': ['ck', 'chk', 'chkn'], 'lamb': ['lam', 'lmb'],
  'salmon': ['sal', 'salm'], 'beef': ['bf'], 'turkey': ['trk', 'turk'],
  'puppy': ['pup', 'ppy'], 'kitten': ['kit', 'ktn'], 'senior': ['sen', 'snr'],
  'adult': ['adt'], 'light': ['lt', 'lite'], 'grain free': ['gr fr', 'grf'],
  'original': ['orig'], 'premium': ['prem'], 'maintenance': ['mainten'],
  'yorkshire': ['york'], 'chihuahua': ['chih'], 'dachshund': ['dach'],
  'shampoo': ['shmp'], 'conditioner': ['cond'], 'treats': ['trt', 'trts'],
  'food': ['fd'], 'canned': ['can', 'cnd'], 'dry': ['dr'],
};

function normalize(t: string): string {
  let s = t.toLowerCase();
  s = s.replace(/(\d+\.?\d*)\s*(?:lb|lbs|#|pound|oz|ounce|kg|g)/gi, '$1');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function expand(t: string): string {
  let s = normalize(t);
  for (const [full, abbrs] of Object.entries(brandAbbr)) {
    for (const a of abbrs) s = s.replace(new RegExp(`\\b${a}\\b`, 'g'), full);
  }
  for (const [full, abbrs] of Object.entries(wordAbbr)) {
    for (const a of abbrs) s = s.replace(new RegExp(`\\b${a}\\b`, 'g'), full);
  }
  return s.trim();
}

function score(src: string, db: string): number {
  const sWords = new Set(normalize(src).split(' ').filter(w => w.length > 1));
  const dWords = new Set(normalize(db).split(' ').filter(w => w.length > 1));
  if (!sWords.size || !dWords.size) return 0;
  let m = 0;
  for (const w of sWords) if (dWords.has(w)) m++;
  const p = m / sWords.size, r = m / dWords.size;
  return p + r > 0 ? 2 * p * r / (p + r) : 0;
}

async function main() {
  const upcs = JSON.parse(fs.readFileSync('.local/state/memory/master_upc_database.json', 'utf-8'));
  console.log(`Loaded ${upcs.length} UPCs from master database`);
  
  // Get already used UPCs
  const usedUpcs = await db.execute(sql`SELECT DISTINCT sku FROM supplies WHERE sku IS NOT NULL`);
  const usedSet = new Set((usedUpcs.rows as any[]).map(r => r.sku));
  console.log(`${usedSet.size} UPCs already assigned`);
  
  // Get unmatched products
  const unmatched = await db.select({ id: supplies.id, name: supplies.name })
    .from(supplies).where(isNull(supplies.sku));
  console.log(`${unmatched.length} products without UPC`);
  
  // Filter to unused UPCs
  const availableUpcs = upcs.filter((u: any) => !usedSet.has(u.upc));
  console.log(`${availableUpcs.length} UPCs still available`);
  
  const prods = unmatched.map(p => ({ id: p.id, name: p.name, exp: expand(p.name) }));
  const srcs = availableUpcs.map((u: any) => ({ upc: u.upc, name: u.name, exp: expand(u.name) }));
  
  srcs.sort((a: any, b: any) => b.name.length - a.name.length);
  
  const matches: {upc: string, id: number, score: number}[] = [];
  const used = new Set<number>();
  const MIN = 0.2; // Lower threshold for second pass
  
  for (const s of srcs) {
    let best: {id: number, sc: number} | null = null;
    for (const p of prods) {
      if (used.has(p.id)) continue;
      const sc = score(s.exp, p.exp);
      if (sc >= MIN && (!best || sc > best.sc)) best = { id: p.id, sc };
    }
    if (best) { 
      matches.push({ upc: s.upc, id: best.id, score: best.sc }); 
      used.add(best.id); 
    }
  }
  
  console.log(`Found ${matches.length} additional matches (threshold ${MIN})`);
  
  // Save matches
  fs.writeFileSync('.local/state/memory/remaining_matches.json', JSON.stringify(matches, null, 2));
  
  // Apply in batches
  let applied = 0;
  for (let i = 0; i < matches.length; i += 50) {
    const batch = matches.slice(i, i + 50);
    for (const m of batch) {
      await db.execute(sql`UPDATE supplies SET sku = ${m.upc} WHERE id = ${m.id}`);
    }
    applied += batch.length;
    if ((i + 50) % 200 === 0 || i + 50 >= matches.length) {
      console.log(`Applied: ${Math.min(i + 50, matches.length)}/${matches.length}`);
    }
  }
  
  const stats = await db.execute(sql`
    SELECT COUNT(*) as total, COUNT(sku) as with_sku, COUNT(DISTINCT sku) as unique_skus 
    FROM supplies
  `);
  console.log('Final stats:', stats.rows[0]);
}

main().catch(console.error);
