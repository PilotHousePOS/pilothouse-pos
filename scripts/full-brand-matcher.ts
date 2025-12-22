import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql, eq } from "drizzle-orm";
import * as fs from "fs";

// Extended brand aliases - normalized -> [aliases]
const BRAND_ALIASES: Record<string, string[]> = {
  "science diet": ["sd", "hills science diet", "hill's science diet", "hills sd"],
  "nutrisource": ["nutri sou", "nutrisou", "ntrsc", "nutri source", "ns"],
  "blue buffalo": ["bb", "blbuf", "blue buf", "bluebuf", "blue bb"],
  "fromm": ["frm", "fromms", "froms"],
  "royal canin": ["rc", "roy can", "roycan", "royal"],
  "wellness": ["wlns", "well", "wllns"],
  "purina": ["prina", "pur", "purina pro plan"],
  "pro plan": ["pro pln", "pp"],
  "orijen": ["orjn", "orn"],
  "acana": ["acan", "acn"],
  "canidae": ["cndy", "cndae", "can"],
  "primal": ["prml", "prim"],
  "instinct": ["instct", "instinct natures variety"],
  "zignature": ["zgntr", "zig"],
  "4health": ["4hlth"],
  "merrick": ["mrck", "merrik"],
  "taste of the wild": ["totw", "tastewild"],
  "coastal": ["cstl", "coastal pet"],
  "kong": ["kong"],
  "nylabone": ["nyla", "nylb"],
  "tetra": ["tetra", "ttr"],
  "api": ["api", "aquarium pharmaceuticals"],
  "seachem": ["seachem", "seachm"],
  "zoo med": ["zoomed", "zm", "zoo"],
  "fluker's": ["flukers", "flukr", "fluker"],
  "exo terra": ["exoterra", "exo", "exo t"],
  "hikari": ["hkr", "hik"],
  "marineland": ["mrnlnd", "marine"],
  "aqueon": ["aqn", "aquen"],
  "penn-plax": ["pennplax", "penn plax", "pp"],
  "li'l pals": ["lil pals", "lilpals", "lil pal"],
  "fluval": ["fluv", "fluvl"],
  "kaytee": ["kayt", "kt"],
  "zilla": ["zil", "zlla"],
  "spot": ["spot"],
  "redBarn": ["redbarn", "rb"],
  "oxbow": ["oxb", "ox"],
  "prevue": ["prev", "prevue hendryx"],
  "tropclean": ["tropic", "tropiclean"],
  "birdlife": ["bird life", "brdlf"],
  "catit": ["catit", "cat"],
  "aquatop": ["aqua top", "aqtp"],
  "safari": ["safari", "sfr"],
  "greenies": ["greens", "grns"],
  "petmate": ["petmt", "pm"],
  "circle t": ["circt", "circle"],
  "titan": ["titan", "ttn"],
  "naturvet": ["naturv", "nv"],
  "valhoma": ["valh"],
  "diamond": ["dimd", "dmnd"],
  "wee-wee": ["weewee", "wee"],
  "four paws": ["4paws", "fourpaws", "4p"],
  "ethical pet": ["ethical", "eth pet"],
  "benebone": ["beneb", "bone"],
  "petcrest": ["petcr", "pc"],
  "vital essentials": ["vital ess", "ve"],
  "jw pet": ["jw", "jwpet"],
  "victor": ["victor", "vict"],
  "iams": ["iams"],
  "inaba": ["inaba"],
};

// Size patterns
const SIZE_PATTERNS = [
  { regex: /(\d+(?:\.\d+)?)\s*(?:lb|lbs|#|pound)/i, unit: "lb" },
  { regex: /(\d+(?:\.\d+)?)\s*(?:oz|ounce)/i, unit: "oz" },
  { regex: /(\d+(?:\.\d+)?)\s*(?:kg)/i, unit: "kg" },
  { regex: /(\d+(?:\.\d+)?)\s*(?:ct|count|pk|pack)/i, unit: "ct" },
  { regex: /(\d+(?:\.\d+)?)\s*(?:"|in(?:ch)?)/i, unit: "in" },
  { regex: /(\d+(?:\.\d+)?)\s*(?:ml|gal)/i, unit: "ml" },
];

function extractSize(name: string): { value: number; unit: string } | null {
  for (const { regex, unit } of SIZE_PATTERNS) {
    const match = name.match(regex);
    if (match) return { value: parseFloat(match[1]), unit };
  }
  return null;
}

function normalizeBrand(text: string): string {
  const lower = text.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(BRAND_ALIASES)) {
    if (lower === canonical || aliases.includes(lower)) return canonical;
    for (const alias of aliases) {
      if (lower.startsWith(alias + " ") || lower === alias) return canonical;
    }
  }
  return lower;
}

function extractBrandFromName(name: string): string | null {
  const lower = name.toLowerCase();
  const sortedBrands = Object.entries(BRAND_ALIASES)
    .flatMap(([brand, aliases]) => [brand, ...aliases])
    .sort((a, b) => b.length - a.length);
  
  for (const brand of sortedBrands) {
    const regex = new RegExp(`(^|\\s)${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`, 'i');
    if (regex.test(lower)) {
      return normalizeBrand(brand);
    }
  }
  // Return first word if it might be a brand
  const firstWord = lower.split(/\s+/)[0];
  if (firstWord.length >= 3) return firstWord;
  return null;
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 2);
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

interface CatalogEntry {
  upc: string;
  names: string[];
  primaryName: string;
}

interface Match {
  supplyId: number;
  supplyName: string;
  catalogName: string;
  upc: string;
  score: number;
  brandMatch: boolean;
  sizeMatch: boolean;
}

async function main() {
  console.log("Loading UPC catalog...");
  const catalog: { entries: CatalogEntry[] } = JSON.parse(
    fs.readFileSync("./scripts/upc_catalog.json", "utf-8")
  );
  console.log(`Loaded ${catalog.entries.length} catalog entries`);

  // Build brand-indexed catalog
  const brandIndex = new Map<string, CatalogEntry[]>();
  const allEntries: CatalogEntry[] = [];
  
  for (const entry of catalog.entries) {
    allEntries.push(entry);
    for (const name of entry.names) {
      const brand = extractBrandFromName(name);
      if (brand) {
        if (!brandIndex.has(brand)) brandIndex.set(brand, []);
        brandIndex.get(brand)!.push(entry);
      }
    }
  }
  console.log(`Indexed ${brandIndex.size} brands`);

  console.log("\nFetching supplies...");
  const allSupplies = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    upc: supplies.upc
  }).from(supplies);
  
  const withoutUpc = allSupplies.filter(s => !s.upc);
  console.log(`Total: ${allSupplies.length}, Without UPC: ${withoutUpc.length}`);

  const matches: Match[] = [];
  const usedUpcs = new Set<string>();
  let processed = 0;

  for (const supply of withoutUpc) {
    const supplyBrand = supply.brand 
      ? normalizeBrand(supply.brand)
      : extractBrandFromName(supply.name);
    const supplySize = extractSize(supply.name);
    const supplyTokens = tokenize(supply.name);
    
    // Get candidates - prefer brand-matched, fallback to all
    let candidates = supplyBrand ? (brandIndex.get(supplyBrand) || []) : [];
    
    let bestMatch: Match | null = null;
    let bestScore = 0;

    for (const entry of candidates) {
      if (usedUpcs.has(entry.upc)) continue;

      for (const catalogName of entry.names) {
        const catalogBrand = extractBrandFromName(catalogName);
        const brandMatch = !supplyBrand || !catalogBrand || 
          normalizeBrand(supplyBrand) === normalizeBrand(catalogBrand);
        
        if (!brandMatch) continue;
        
        const catalogSize = extractSize(catalogName);
        const sizeMatch = !supplySize || !catalogSize || 
          (supplySize.unit === catalogSize.unit && 
           Math.abs(supplySize.value - catalogSize.value) < 0.5);
        
        if (!sizeMatch) continue;
        
        const catalogTokens = tokenize(catalogName);
        const similarity = jaccard(supplyTokens, catalogTokens);
        
        if (similarity >= 0.6 && similarity > bestScore) {
          bestScore = similarity;
          bestMatch = {
            supplyId: supply.id,
            supplyName: supply.name,
            catalogName,
            upc: entry.upc,
            score: similarity,
            brandMatch: !!supplyBrand && !!catalogBrand,
            sizeMatch: !!supplySize && !!catalogSize
          };
        }
      }
    }

    if (bestMatch && bestScore >= 0.7) {
      matches.push(bestMatch);
      usedUpcs.add(bestMatch.upc);
    }

    processed++;
    if (processed % 1000 === 0) {
      console.log(`Processed ${processed}/${withoutUpc.length}, found ${matches.length} matches`);
    }
  }

  console.log(`\nTotal matches: ${matches.length}`);
  
  const highConf = matches.filter(m => m.score >= 0.85);
  const medConf = matches.filter(m => m.score >= 0.7 && m.score < 0.85);
  
  console.log(`High confidence (>=85%): ${highConf.length}`);
  console.log(`Medium confidence (70-85%): ${medConf.length}`);

  fs.writeFileSync("./scripts/full_brand_matches.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalMatches: matches.length,
    matches
  }, null, 2));

  // Apply high confidence matches
  console.log("\nApplying high confidence matches...");
  let applied = 0;
  for (const match of highConf) {
    await db.update(supplies)
      .set({ upc: match.upc })
      .where(eq(supplies.id, match.supplyId));
    applied++;
  }
  console.log(`Applied ${applied} UPC codes`);

  // Final stats
  const final = await db.select({
    total: sql<number>`count(*)`,
    withUpc: sql<number>`count(upc)`
  }).from(supplies);
  
  console.log(`\n=== COVERAGE ===`);
  console.log(`With UPC: ${final[0].withUpc} / ${final[0].total}`);
  console.log(`Coverage: ${((final[0].withUpc / final[0].total) * 100).toFixed(1)}%`);

  console.log("\nSample matches:");
  highConf.slice(0, 15).forEach(m => {
    console.log(`  ${m.supplyName.substring(0, 40)} -> ${m.catalogName.substring(0, 35)} (${(m.score*100).toFixed(0)}%)`);
  });

  process.exit(0);
}

main().catch(console.error);
