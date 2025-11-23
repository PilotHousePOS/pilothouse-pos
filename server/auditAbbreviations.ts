import { storage } from './storage';
import { expandAbbreviationsAsync } from './abbreviationExpansion';

/**
 * Audit script to identify supplies with potential unknown abbreviations
 * that may need brand catalog entries
 */
export async function auditUnknownAbbreviations(): Promise<{
  total: number;
  catalogHits: number;
  genericFallbacks: number;
  unknownAbbreviations: Array<{
    id: number;
    name: string;
    brand: string | null;
    suspectedAbbreviations: string[];
  }>;
}> {
  console.log('Starting abbreviation audit...');
  
  const supplies = await storage.getAllSupplies();
  console.log(`Auditing ${supplies.length} supplies...`);
  
  let catalogHits = 0;
  const unknownAbbreviations: Array<{
    id: number;
    name: string;
    brand: string | null;
    suspectedAbbreviations: string[];
  }> = [];
  
  for (const supply of supplies) {
    const original = supply.name;
    const { expanded, catalogUsed } = await expandAbbreviationsAsync(original, supply.brand);
    
    if (catalogUsed) {
      catalogHits++;
    }
    
    // Detect potential unknown abbreviations:
    // 1. Has uppercase sequences that aren't common acronyms
    // 2. Has short words (2-3 chars) that might be abbreviated
    // 3. Changed after expansion (meaning generic fallback was used)
    const suspectedAbbreviations: string[] = [];
    
    // Pattern 1: Uppercase sequences (likely abbreviations)
    const uppercaseMatches = original.match(/\b[A-Z]{2,}\b/g);
    if (uppercaseMatches) {
      suspectedAbbreviations.push(...uppercaseMatches);
    }
    
    // Pattern 2: Short words that might be abbreviated (2-3 chars, not common words)
    const commonWords = new Set(['of', 'or', 'in', 'on', 'at', 'to', 'oz', 'lb', 'mg', 'ml', 'cm', 'mm']);
    const shortWords = original.match(/\b[A-Za-z]{2,3}\b/g);
    if (shortWords) {
      shortWords.forEach(word => {
        if (!commonWords.has(word.toLowerCase())) {
          suspectedAbbreviations.push(word);
        }
      });
    }
    
    // Pattern 3: Generic expansion happened (no catalog hit but name changed)
    const changedWithoutCatalog = !catalogUsed && expanded !== original;
    
    // Report if suspected abbreviations found or generic fallback was used
    if (suspectedAbbreviations.length > 0 || changedWithoutCatalog) {
      // Deduplicate
      const unique = Array.from(new Set(suspectedAbbreviations));
      if (unique.length > 0) {
        unknownAbbreviations.push({
          id: supply.id,
          name: original,
          brand: supply.brand,
          suspectedAbbreviations: unique,
        });
      }
    }
  }
  
  const genericFallbacks = supplies.length - catalogHits;
  
  console.log(`Audit complete: ${catalogHits} catalog hits, ${genericFallbacks} generic fallbacks`);
  console.log(`Found ${unknownAbbreviations.length} supplies with suspected unknown abbreviations`);
  
  return {
    total: supplies.length,
    catalogHits,
    genericFallbacks,
    unknownAbbreviations,
  };
}
