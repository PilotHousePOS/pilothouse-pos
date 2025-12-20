import fs from 'fs';
import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, eq, isNull } from 'drizzle-orm';

// Comprehensive brand abbreviation mappings
const brandAbbr: Record<string, string[]> = {
  'science diet': ['sd', 'scidiet', 'hill', 'hills', 'hsd'],
  'blue buffalo': ['bb', 'bluebuff', 'blue buff', 'blue'],
  'royal canin': ['rc', 'royalc', 'royal can', 'royalcanin'],
  'diamond': ['diam', 'dia'], 
  'diamond naturals': ['dn', 'diam nat'],
  'kong': ['kon', 'kng'], 
  'zilla': ['zil', 'zla'],
  'zoo med': ['zm', 'zoomed', 'zoo', 'zmed'],
  'exo terra': ['et', 'exoterra', 'exo'],
  'tetra': ['tet', 'tetr'],
  'hikari': ['hik', 'hkr'],
  'aqueon': ['aqe', 'aqn'],
  'coastal': ['cst', 'coast'],
  'kaytee': ['kay', 'kt', 'ktee'],
  'fromm': ['frm', 'frmm'],
  'nutrisource': ['ns', 'nutri sour', 'nutrisrc'],
  'redbarn': ['rb', 'red b', 'rdbarn'],
  'orijen': ['orj', 'orjn'],
  'acana': ['ac', 'acn'],
  'victor': ['vic', 'vict'],
  'pro plan': ['pp', 'proplan', 'purina pro'],
  'natural balance': ['nb', 'natbal'],
  'taste of the wild': ['tow', 'totw', 'taste wild'],
  'wellness': ['well', 'wlns'],
  'merrick': ['mer', 'mrck'],
  'canidae': ['can', 'cand'],
  'nutro': ['nut', 'nutr'],
  'fluval': ['fluv', 'flv'],
  'seachem': ['seach', 'schem'],
  'api': ['api'],
  'oxbow': ['ox', 'oxb'],
  'prevue': ['prev', 'pv'],
  'a & e': ['ae', 'a&e'],
  'marshall': ['marsh', 'mrsh'],
  'greenies': ['grn', 'green'],
  'nylabone': ['nyla', 'nylb'],
  'busy bone': ['busy'],
  'milk bone': ['milkb', 'mlkbn'],
  'pedigree': ['ped', 'pdgr'],
  'purina': ['pur', 'prna'],
  'purina one': ['po', 'pur one'],
  'iams': ['iam', 'im'],
  'eukanuba': ['euk'],
  'cesar': ['ces'],
  'beneful': ['ben', 'bnfl'],
  'bil jac': ['bilj', 'bj'],
  'rachael ray': ['rr', 'rray'],
  'nutro ultra': ['nu', 'nutro u'],
  'natures variety': ['nv', 'nvar'],
  'instinct': ['inst', 'instct'],
  'fancy feast': ['ff', 'fancyf'],
  'friskies': ['frsk', 'frisk'],
  'meow mix': ['mm', 'meow'],
  'tidy cats': ['tc', 'tidy'],
  'fresh step': ['fs', 'fstep'],
  'arm hammer': ['ah', 'a&h'],
};

const wordAbbr: Record<string, string[]> = {
  'small': ['sm', 'sml', 's'],
  'medium': ['md', 'med', 'm'],
  'large': ['lg', 'lrg', 'l'],
  'extra large': ['xl', 'xlg', 'xlarge'],
  'extra small': ['xs', 'xsm'],
  'breed': ['br', 'brd'],
  'chicken': ['ck', 'chk', 'chkn', 'chick'],
  'lamb': ['lam', 'lmb', 'lb'],
  'salmon': ['sal', 'salm', 'slm'],
  'beef': ['bf', 'bef'],
  'turkey': ['trk', 'turk', 'tky'],
  'duck': ['dk', 'dck'],
  'fish': ['fsh'],
  'venison': ['ven', 'vnsn'],
  'puppy': ['pup', 'ppy', 'pp'],
  'kitten': ['kit', 'ktn', 'kt'],
  'senior': ['sen', 'snr', 'sr'],
  'adult': ['adt', 'ad'],
  'light': ['lt', 'lite', 'lght'],
  'grain free': ['gr fr', 'grf', 'gf'],
  'original': ['orig', 'org'],
  'premium': ['prem', 'prm'],
  'maintenance': ['mainten', 'maint'],
  'formula': ['form', 'frm'],
  'flavor': ['flav', 'flvr'],
  'indoor': ['ind', 'indr'],
  'outdoor': ['out', 'outdr'],
  'weight': ['wt', 'wght'],
  'healthy': ['hlthy', 'hth'],
  'natural': ['nat', 'ntrl'],
  'organic': ['org', 'orgc'],
  'grain': ['grn', 'gr'],
  'free': ['fr'],
  'canned': ['can', 'cnd', 'cn'],
  'dry': ['dr'],
  'wet': ['wt'],
  'treats': ['trt', 'trts', 'treat'],
  'food': ['fd'],
  'pound': ['lb', '#', 'lbs'],
  'ounce': ['oz'],
};

function normalize(t: string): string {
  let s = t.toLowerCase();
  // Remove weight units but keep numbers
  s = s.replace(/(\d+\.?\d*)\s*(?:lb|lbs|#|pound|oz|ounce|kg|g)\b/gi, ' $1 ');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function expand(t: string): string {
  let s = normalize(t);
  // Expand abbreviations
  for (const [full, abbrs] of Object.entries(brandAbbr)) {
    for (const a of abbrs) {
      s = s.replace(new RegExp(`\\b${a}\\b`, 'gi'), full);
    }
  }
  for (const [full, abbrs] of Object.entries(wordAbbr)) {
    for (const a of abbrs) {
      s = s.replace(new RegExp(`\\b${a}\\b`, 'gi'), full);
    }
  }
  return s.trim();
}

function score(src: string, db: string): number {
  const sWords = new Set(normalize(src).split(' ').filter(w => w.length > 1));
  const dWords = new Set(normalize(db).split(' ').filter(w => w.length > 1));
  if (!sWords.size || !dWords.size) return 0;
  
  let matches = 0;
  for (const w of sWords) {
    if (dWords.has(w)) matches++;
  }
  
  const precision = matches / sWords.size;
  const recall = matches / dWords.size;
  
  // F1 score
  return precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
}

async function main() {
  console.log('=== Comprehensive UPC Matching ===\n');
  
  // 1. Load all UPC sources
  const allUpcs: Map<string, {upc: string, name: string}> = new Map();
  
  // Load Excel UPCs
  if (fs.existsSync('.local/state/memory/all_excel_upcs.json')) {
    const excel = JSON.parse(fs.readFileSync('.local/state/memory/all_excel_upcs.json', 'utf-8'));
    for (const e of excel) {
      if (e.upc && e.name && e.name.length > 3) {
        allUpcs.set(e.upc, { upc: e.upc, name: e.name });
      }
    }
    console.log(`Loaded ${excel.length} from Excel files`);
  }
  
  // Load Google Sheet
  if (fs.existsSync('scripts/google_sheet_upcs.csv')) {
    const csv = fs.readFileSync('scripts/google_sheet_upcs.csv', 'utf-8');
    const lines = csv.split('\n').slice(1);
    let gsCount = 0;
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 2) {
        const upc = parts[0].trim();
        const name = parts[1].trim();
        if (/^\d{10,14}$/.test(upc) && name.length > 2) {
          const existing = allUpcs.get(upc);
          if (!existing || name.length > existing.name.length) {
            allUpcs.set(upc, { upc, name });
          }
          gsCount++;
        }
      }
    }
    console.log(`Loaded ${gsCount} from Google Sheet`);
  }
  
  // Load existing master database
  if (fs.existsSync('.local/state/memory/master_upc_database.json')) {
    const master = JSON.parse(fs.readFileSync('.local/state/memory/master_upc_database.json', 'utf-8'));
    let mCount = 0;
    for (const e of master) {
      if (e.upc && e.name) {
        const existing = allUpcs.get(e.upc);
        if (!existing || e.name.length > existing.name.length) {
          allUpcs.set(e.upc, { upc: e.upc, name: e.name });
        }
        mCount++;
      }
    }
    console.log(`Loaded ${mCount} from master database`);
  }
  
  const upcs = Array.from(allUpcs.values());
  console.log(`\nTotal unique UPCs: ${upcs.length}`);
  
  // Save combined database
  fs.writeFileSync('.local/state/memory/combined_upc_database.json', JSON.stringify(upcs, null, 2));
  
  // 2. Load all products
  const products = await db.select({ id: supplies.id, name: supplies.name, sku: supplies.sku })
    .from(supplies);
  console.log(`Total products: ${products.length}`);
  
  // Prepare expanded names
  const prods = products.map(p => ({ 
    id: p.id, 
    name: p.name, 
    sku: p.sku,
    exp: expand(p.name || '') 
  }));
  
  const srcs = upcs.map(u => ({ 
    upc: u.upc, 
    name: u.name, 
    exp: expand(u.name) 
  }));
  
  // Sort by name length (longer names first = more specific)
  srcs.sort((a, b) => b.name.length - a.name.length);
  
  // 3. Match UPCs to products
  console.log('\nMatching...');
  const matches: {upc: string, id: number, score: number, upcName: string, prodName: string}[] = [];
  const usedProducts = new Set<number>();
  const usedUpcs = new Set<string>();
  const MIN_SCORE = 0.25;
  
  // First pass: find best matches
  for (const s of srcs) {
    if (usedUpcs.has(s.upc)) continue;
    
    let best: {id: number, sc: number, name: string} | null = null;
    
    for (const p of prods) {
      if (usedProducts.has(p.id)) continue;
      if (p.sku) continue; // Already has SKU
      
      const sc = score(s.exp, p.exp);
      if (sc >= MIN_SCORE && (!best || sc > best.sc)) {
        best = { id: p.id, sc, name: p.name || '' };
      }
    }
    
    if (best) {
      matches.push({ 
        upc: s.upc, 
        id: best.id, 
        score: best.sc,
        upcName: s.name,
        prodName: best.name
      });
      usedProducts.add(best.id);
      usedUpcs.add(s.upc);
    }
  }
  
  console.log(`Found ${matches.length} matches`);
  
  // Save matches
  fs.writeFileSync('.local/state/memory/new_comprehensive_matches.json', JSON.stringify(matches, null, 2));
  
  // 4. Apply matches in batches
  console.log('\nApplying matches...');
  let applied = 0;
  const BATCH = 50;
  
  for (let i = 0; i < matches.length; i += BATCH) {
    const batch = matches.slice(i, i + BATCH);
    for (const m of batch) {
      try {
        await db.update(supplies).set({ sku: m.upc }).where(eq(supplies.id, m.id));
        applied++;
      } catch (err) {
        // Skip errors
      }
    }
    if ((i + BATCH) % 500 === 0 || i + BATCH >= matches.length) {
      console.log(`Applied: ${Math.min(i + BATCH, matches.length)}/${matches.length}`);
    }
  }
  
  // 5. Report final stats
  const stats = await db.execute(sql`
    SELECT 
      COUNT(*) as total, 
      COUNT(sku) as with_sku, 
      COUNT(DISTINCT sku) as unique_skus 
    FROM supplies
  `);
  
  const row = stats.rows[0] as any;
  const total = parseInt(row.total);
  const withSku = parseInt(row.with_sku);
  const coverage = ((withSku / total) * 100).toFixed(1);
  
  console.log(`\n=== Final Results ===`);
  console.log(`Total products: ${total}`);
  console.log(`With UPC: ${withSku}`);
  console.log(`Unique UPCs: ${row.unique_skus}`);
  console.log(`Coverage: ${coverage}%`);
  
  // Show sample high-score matches
  console.log('\nSample high-confidence matches:');
  matches.filter(m => m.score >= 0.8).slice(0, 5).forEach(m => {
    console.log(`  [${m.score.toFixed(2)}] ${m.upc}: "${m.upcName}" → "${m.prodName}"`);
  });
}

main().catch(console.error);
