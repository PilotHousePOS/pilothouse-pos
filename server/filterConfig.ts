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
    includeBrands: ['ZooMed', 'Exo Terra', 'Zilla', "Fluker's", 'ReptiCare'],
    includeKeywords: [
      'gecko', 'lizard', 'snake', 'turtle', 'tortoise', 'chameleon',
      'bearded dragon', 'iguana', 'frog', 'toad', 'salamander', 'newt',
      'reptile', 'amphibian', 'terrarium', 'vivarium', 'repti'
    ],
    excludeBrands: ['Tetra', 'Aqueon', 'GloFish', 'Marina', 'API', 'Fluval', 'SeaChem', 'Hikari'],
    excludeKeywords: ['fish', 'aquarium', 'aquatic', 'glo fish', 'betta']
  },
  aquatic: {
    includeBrands: ['Tetra', 'Aqueon', 'GloFish', 'Marina', 'API', 'Fluval', 'SeaChem', 'Hikari'],
    includeKeywords: [
      'fish', 'aquarium', 'aquatic', 'betta', 'glo fish', 'goldfish',
      'tropical fish', 'freshwater', 'saltwater', 'reef', 'marine'
    ],
    excludeBrands: ['ZooMed', 'Exo Terra', 'Zilla', "Fluker's", 'ReptiCare'],
    excludeKeywords: [
      'gecko', 'lizard', 'snake', 'bearded dragon', 'iguana',
      'reptile', 'terrarium', 'vivarium', 'repti'
    ]
  }
};
