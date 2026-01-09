import { db } from "../db";
import { supplies } from "@shared/schema";
import { eq, or, ilike } from "drizzle-orm";

interface POSFields {
  color: string;
  size: string;
  style: string;
}

function extractSizeFromName(name: string): string {
  const sizeMatch = name.match(/(\d+(?:\.\d+)?)\s*(lb|oz|kg|g)\b/i);
  if (sizeMatch) {
    return `${sizeMatch[1]}${sizeMatch[2].toLowerCase()}`;
  }
  return "";
}

function getScienceDietColor(name: string): string {
  const lowerName = name.toLowerCase();
  
  // Puppy products = Green band
  if (/puppy|pupp\b/i.test(lowerName)) {
    return "Green";
  }
  
  // Kitten products = Teal/Turquoise
  if (/kitten/i.test(lowerName)) {
    return "Teal";
  }
  
  // Specialty/Prescription products = Silver
  // These typically include: Sensitive, Urinary, Prescription, i/d, z/d, k/d, etc.
  if (/sensitive|urinary|prescription|digestive|metabolic|mobility|brain|oral|perfect|derm|i\/d|z\/d|k\/d|w\/d|c\/d|l\/d|j\/d|d\/d|h\/d|t\/d|m\/d|a\/d|b\/d|r\/d|s\/d/i.test(lowerName)) {
    return "Silver";
  }
  
  // Light/Weight Management products may have light blue or different shade
  if (/light|weight|perfect weight|healthy weight/i.test(lowerName)) {
    return "Red"; // Still red band for adult weight management
  }
  
  // Senior 7+, 11+ Adult products = Red band (same as regular adult)
  if (/7\+|11\+|senior|mature/i.test(lowerName)) {
    return "Red";
  }
  
  // Regular adult products = Red band
  return "Red";
}

function getNutriSourceColor(name: string): string {
  const lowerName = name.toLowerCase();
  
  // Large Breed Puppy = Purple
  if (/large breed.*puppy|puppy.*large breed/i.test(lowerName)) {
    return "Purple";
  }
  
  // Regular Puppy = Light Blue or different shade
  if (/puppy/i.test(lowerName)) {
    return "Blue";
  }
  
  // Lamb = Orange
  if (/lamb/i.test(lowerName)) {
    return "Orange";
  }
  
  // Salmon/Fish = Blue
  if (/salmon|fish|whitefish|ocean/i.test(lowerName)) {
    return "Blue";
  }
  
  // Chicken = Red/Maroon
  if (/chicken/i.test(lowerName)) {
    return "Red";
  }
  
  // Beef = Brown
  if (/beef/i.test(lowerName)) {
    return "Brown";
  }
  
  // Turkey = Burgundy
  if (/turkey/i.test(lowerName)) {
    return "Burgundy";
  }
  
  // Venison = Green
  if (/venison|deer/i.test(lowerName)) {
    return "Green";
  }
  
  // Pork = Pink
  if (/pork/i.test(lowerName)) {
    return "Pink";
  }
  
  // Duck = Orange/Yellow
  if (/duck/i.test(lowerName)) {
    return "Orange";
  }
  
  // Default to primary brand color
  return "Red";
}

function extractStyleFromName(name: string, brand: string): string {
  const parts: string[] = [];
  
  // Life stage
  if (/puppy/i.test(name)) parts.push("Puppy");
  else if (/kitten/i.test(name)) parts.push("Kitten");
  else if (/11\+/i.test(name)) parts.push("Senior 11+");
  else if (/7\+/i.test(name)) parts.push("Senior 7+");
  else if (/senior|mature/i.test(name)) parts.push("Senior");
  else if (/adult/i.test(name)) parts.push("Adult");
  
  // Breed size
  if (/small\s*&\s*mini|toy breed/i.test(name)) parts.push("Small & Mini");
  else if (/small bite/i.test(name)) parts.push("Small Bite");
  else if (/large breed/i.test(name)) parts.push("Large Breed");
  
  // Protein/flavor
  if (/chicken/i.test(name)) parts.push("Chicken");
  if (/beef/i.test(name)) parts.push("Beef");
  if (/lamb/i.test(name)) parts.push("Lamb");
  if (/salmon/i.test(name)) parts.push("Salmon");
  if (/turkey/i.test(name)) parts.push("Turkey");
  if (/tuna/i.test(name)) parts.push("Tuna");
  if (/fish|whitefish/i.test(name)) parts.push("Fish");
  if (/ocean/i.test(name)) parts.push("Ocean Fish");
  if (/venison/i.test(name)) parts.push("Venison");
  if (/duck/i.test(name)) parts.push("Duck");
  if (/pork/i.test(name)) parts.push("Pork");
  
  // Special features
  if (/indoor/i.test(name)) parts.push("Indoor");
  if (/hairball/i.test(name)) parts.push("Hairball Control");
  if (/sensitive/i.test(name)) parts.push("Sensitive");
  if (/weight|light/i.test(name)) parts.push("Weight Management");
  if (/urinary/i.test(name)) parts.push("Urinary");
  if (/oral/i.test(name)) parts.push("Oral Care");
  if (/healthy mobility/i.test(name)) parts.push("Healthy Mobility");
  if (/perfect digestion/i.test(name)) parts.push("Perfect Digestion");
  if (/grain\s*free/i.test(name)) parts.push("Grain Free");
  
  // Format
  if (/stew/i.test(name)) parts.push("Stew");
  else if (/pate/i.test(name)) parts.push("Pate");
  else if (/savory/i.test(name)) parts.push("Savory");
  else if (/\d+(\.\d+)?\s*oz/i.test(name)) parts.push("Wet");
  else if (/\d+(\.\d+)?\s*lb/i.test(name)) parts.push("Dry");
  
  return parts.join(" ");
}

async function processProducts(brandFilter: string, colorFn: (name: string) => string) {
  console.log(`\n=== Processing ${brandFilter} products ===\n`);
  
  const products = await db
    .select({
      id: supplies.id,
      name: supplies.name,
      brand: supplies.brand,
      color: supplies.color,
      size: supplies.size,
      style: supplies.style,
    })
    .from(supplies)
    .where(
      or(
        ilike(supplies.brand, `%${brandFilter}%`),
        ilike(supplies.name, `%${brandFilter}%`)
      )
    )
    .orderBy(supplies.name);

  console.log(`Found ${products.length} ${brandFilter} products`);
  
  let updated = 0;

  for (const product of products) {
    const color = colorFn(product.name);
    const size = extractSizeFromName(product.name);
    const style = extractStyleFromName(product.name, product.brand || "");
    
    // Only update if we have new data
    if (color || size || style) {
      await db
        .update(supplies)
        .set({
          color: color || product.color || null,
          size: size || product.size || null,
          style: style || product.style || null,
        })
        .where(eq(supplies.id, product.id));

      console.log(`  [${product.id}] ${product.name}`);
      console.log(`      Color: ${color}, Size: ${size}, Style: ${style}`);
      updated++;
    }
  }

  console.log(`\n=== ${brandFilter} Complete: ${updated}/${products.length} updated ===\n`);
  return updated;
}

async function main() {
  console.log("Starting POS Field Extraction (Rule-Based)...\n");
  
  // Process Science Diet products
  const scienceDietCount = await processProducts("science diet", getScienceDietColor);
  
  // Process NutriSource products
  const nutriSourceCount = await processProducts("nutrisource", getNutriSourceColor);
  
  console.log("\n=== FINAL SUMMARY ===");
  console.log(`Science Diet: ${scienceDietCount} products updated`);
  console.log(`NutriSource: ${nutriSourceCount} products updated`);
  console.log(`Total: ${scienceDietCount + nutriSourceCount} products updated`);
}

main().catch(console.error);
