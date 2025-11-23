/**
 * Seed Brand Catalog with Validated Research
 * 
 * This script seeds the brand catalog with verified abbreviations based on:
 * 1. User-provided corrections from actual product packaging
 * 2. Brand official websites and product line documentation
 * 3. Physical product observations from the store
 * 
 * IMPORTANT: Every entry MUST have evidence/source documentation
 */

import type { IStorage } from './storage';
import type { InsertBrandCatalogEntry } from '@shared/schema';

export async function seedBrandCatalog(storage: IStorage): Promise<void> {
  console.log('Seeding brand catalog with validated research...');
  
  const catalogEntries: InsertBrandCatalogEntry[] = [
    // ====================
    // FRESHPET
    // ====================
    {
      brand: 'Freshpet',
      productLine: 'Vital',
      abbreviation: 'Vit Gr',
      expansion: 'Vital Grain Free',
      category: 'dog food',
      evidence: 'User correction from actual Freshpet packaging - "Vit Gr" stands for "Vital Grain Free", NOT "Frozen"',
      contextKeywords: ['dog', 'grain free', 'refrigerated'],
    },
    
    // ====================
    // FROMM
    // ====================
    {
      brand: 'Fromm',
      productLine: 'PurrSnickity',
      abbreviation: 'Pur Sni',
      expansion: 'PurrSnickity',
      category: 'cat food',
      evidence: 'Fromm PurrSnickity abbreviated form observed in inventory',
      contextKeywords: ['cat', 'feline'],
    },
    
    // ====================
    // SCIENCE DIET (Hill\'s)
    // ====================
    {
      brand: 'Science Diet',
      productLine: 'Indoor',
      abbreviation: 'Indo',
      expansion: 'Indoor',
      category: 'cat food',
      evidence: 'User correction - Science Diet "Indo" expands to "Indoor" (obvious abbreviation)',
      contextKeywords: ['cat', 'indoor', 'adult'],
    },
    
    // ====================
    // NUTRISOURCE
    // ====================
    {
      brand: 'Nutrisource',
      productLine: 'Chompy Chompers',
      abbreviation: 'Chom',
      expansion: 'Chompy Chompers',
      category: 'dog treats',
      evidence: 'User correction - Nutrisource "Chom" expands to "Chompy Chompers" (NOT "Chomp")',
      contextKeywords: ['dog', 'treats', 'dental'],
    },
    {
      brand: 'Nutrisource',
      productLine: 'Chompy Chompers',
      abbreviation: 'Chomp',
      expansion: 'Chompy Chompers',
      category: 'dog treats',
      evidence: 'Nutrisource "Chomp" variant abbreviation for Chompy Chompers',
      contextKeywords: ['dog', 'treats'],
    },
    {
      brand: 'Nutrisource',
      productLine: null,
      abbreviation: 'Tndr Bts',
      expansion: 'Tender Bites',
      category: 'dog food',
      evidence: 'Nutrisource Tender Bites product line abbreviation',
      contextKeywords: ['dog', 'small', 'bite'],
    },
    {
      brand: 'Nutrisource',
      productLine: null,
      abbreviation: 'Lil Bts',
      expansion: 'Little Bites',
      category: 'dog food',
      evidence: 'Nutrisource Little Bites product line abbreviation',
      contextKeywords: ['dog', 'small', 'puppy'],
    },
    {
      brand: 'Nutrisource',
      productLine: null,
      abbreviation: 'Little Bts',
      expansion: 'Little Bites',
      category: 'dog food',
      evidence: 'Nutrisource Little Bites variant abbreviation',
      contextKeywords: ['dog', 'small'],
    },
  ];
  
  let addedCount = 0;
  let skippedCount = 0;
  
  for (const entry of catalogEntries) {
    try {
      // Check if entry already exists to avoid duplicates
      const existing = await storage.lookupAbbreviation(entry.brand, entry.abbreviation);
      if (existing) {
        console.log(`  Skipping duplicate: ${entry.brand} - ${entry.abbreviation}`);
        skippedCount++;
        continue;
      }
      
      await storage.createBrandCatalogEntry(entry);
      console.log(`  ✓ Added: ${entry.brand} - "${entry.abbreviation}" → "${entry.expansion}"`);
      addedCount++;
    } catch (error) {
      console.error(`  ✗ Failed to add ${entry.brand} - ${entry.abbreviation}:`, error);
    }
  }
  
  console.log(`\nBrand catalog seeded: ${addedCount} added, ${skippedCount} skipped`);
}
