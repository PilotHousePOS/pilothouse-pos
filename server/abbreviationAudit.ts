import { storage } from './storage';
import type { IStorage } from './storage';
import { expandAbbreviationsAsync } from './abbreviationExpansion';

/**
 * Audit all supplies to identify unknown abbreviations that need brand catalog research
 * Returns supplies that:
 * 1. Changed without using the brand catalog (only generic fallbacks)
 * 2. Contain suspected abbreviations (uppercase sequences, short words)
 */
export async function auditUnknownAbbreviations() {
  const allSupplies = await storage.getAllSupplies();
  const totalCount = allSupplies.length;
  console.log(`Auditing ${totalCount} supplies for unknown abbreviations...`);
  
  let total = 0;
  let catalogHits = 0;
  const unknownAbbreviations: Array<{
    id: number;
    name: string;
    expandedName: string;
    reason: string;
  }> = [];
  
  for (const supply of allSupplies) {
    total++;
    
    // Log progress every 1000 products
    if (total % 1000 === 0) {
      console.log(`Audit Progress: ${total}/${totalCount} (${Math.round(total/totalCount*100)}%)`);
    }
    
    const result = await expandAbbreviationsAsync(supply.name, storage as IStorage);
    
    // Track catalog hits (items that used brand catalog)
    if (result.catalogUsed) {
      catalogHits++;
      continue; // Skip items that successfully used catalog
    }
    
    // Check if it changed without catalog (generic fallback)
    const changedWithoutCatalog = (result.expanded !== supply.name) && !result.catalogUsed;
    
    // Pattern detection for suspected abbreviations
    const suspectedPatterns: string[] = [];
    const words = supply.name.split(/\s+/);
    
    for (const word of words) {
      // Skip common words and numbers
      if (/^\d+$/.test(word) || word.length < 2) continue;
      
      // Uppercase sequences (2+ chars): Ph, Lg, Xl, etc.
      if (/^[A-Z]{2,}$/.test(word) && word.length <= 4) {
        suspectedPatterns.push(`Uppercase sequence: "${word}"`);
      }
      
      // Short words (2-3 chars) that might be abbreviations
      if (word.length >= 2 && word.length <= 3 && /^[A-Za-z]+$/.test(word)) {
        suspectedPatterns.push(`Short word: "${word}"`);
      }
    }
    
    // Add to unknown list if changed without catalog OR has suspected patterns
    if (changedWithoutCatalog || suspectedPatterns.length > 0) {
      const reasons: string[] = [];
      
      if (changedWithoutCatalog) {
        reasons.push('Generic fallback expansion');
      }
      
      if (suspectedPatterns.length > 0) {
        reasons.push(...suspectedPatterns);
      }
      
      unknownAbbreviations.push({
        id: supply.id,
        name: supply.name,
        expandedName: result.expanded,
        reason: reasons.join(' | '),
      });
    }
  }
  
  // Sort by most suspected abbreviations first
  unknownAbbreviations.sort((a, b) => {
    const aCount = (a.reason.match(/\|/g) || []).length + 1;
    const bCount = (b.reason.match(/\|/g) || []).length + 1;
    return bCount - aCount;
  });
  
  return {
    total,
    catalogHits,
    unknownAbbreviations: unknownAbbreviations.slice(0, 50), // Limit to top 50
  };
}
