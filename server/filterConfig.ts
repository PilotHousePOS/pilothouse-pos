/**
 * Centralized filter configuration for supply categories
 * This allows easy maintenance and scalability for filtering supplies by type
 */

export interface FilterConfig {
  includeBrands: string[];
  includeKeywords: string[];
  excludeBrands: string[];
  excludeKeywords: string[];
}

export type FilterType = 'reptile' | 'aquatic';

export const SUPPLY_FILTERS: Record<FilterType, FilterConfig> = {
  reptile: {
    // Reptile-specialized brands based on company research
    includeBrands: ['ZooMed', 'Exo Terra', 'Zilla', "Fluker's", 'ReptiCare'],
    includeKeywords: [
      'gecko', 'lizard', 'snake', 'turtle', 'tortoise', 'chameleon',
      'bearded dragon', 'iguana', 'frog', 'toad', 'salamander', 'newt',
      'reptile', 'amphibian', 'terrarium', 'vivarium', 'repti'
    ],
    // Exclude all aquatic brands - these are exclusively for fish/aquariums
    excludeBrands: ['Tetra', 'Aqueon', 'GloFish', 'Marineland', 'API', 'Fluval', 'SeaChem', 'Hikari'],
    excludeKeywords: ['fish', 'aquarium', 'aquatic', 'glo fish', 'betta']
  },
  aquatic: {
    // Aquatic-specialized brands based on company research:
    // - Hikari: Premium Japanese aquarium brand (fish food specialist)
    // - Tetra: World's largest aquarium brand (invented first flake food)
    // - Aqueon: Aquarium tanks and supplies (40+ years)
    // - API: Aquarium water testing and treatments
    // - Marineland: Aquarium filters and BIO-Wheel technology
    // - GloFish: Fluorescent fish brand (owned by Spectrum/Tetra)
    // - Fluval: Premium aquarium filters and equipment
    // - SeaChem: Advanced aquarium water care products
    includeBrands: ['Tetra', 'Aqueon', 'GloFish', 'Marineland', 'API', 'Fluval', 'SeaChem', 'Hikari'],
    includeKeywords: [
      'fish', 'aquarium', 'aquatic', 'betta', 'glo fish', 'goldfish',
      'tropical fish', 'freshwater', 'saltwater', 'reef', 'marine', 'koi',
      'cichlid', 'tetra', 'guppy', 'molly', 'platy'
    ],
    // Exclude all reptile brands
    excludeBrands: ['ZooMed', 'Exo Terra', 'Zilla', "Fluker's", 'ReptiCare'],
    excludeKeywords: [
      'gecko', 'lizard', 'snake', 'bearded dragon', 'iguana',
      'reptile', 'terrarium', 'vivarium', 'repti'
    ]
  }
};
