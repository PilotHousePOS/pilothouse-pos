/**
 * Fuzzy search utility for typo-tolerant searching
 * Finds closest matches even with spelling mistakes
 * Includes brand name expansion for abbreviated brand names
 */

import { expandBrandNames } from './brandNameExpansion';

/**
 * Calculate Levenshtein distance between two strings
 * (minimum number of edits needed to transform one string into another)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity score between two strings (0-100)
 * Higher score = more similar
 */
function similarityScore(str1: string, str2: string): number {
  const lower1 = str1.toLowerCase();
  const lower2 = str2.toLowerCase();
  
  // Exact match = 100
  if (lower1 === lower2) return 100;
  
  // Substring match - only give high score if the shorter string is at least 60% of the longer
  // This prevents "mint" matching "furmintor" (mint is only 44% of furmintor)
  const minLen = Math.min(lower1.length, lower2.length);
  const maxLen = Math.max(lower1.length, lower2.length);
  const lengthRatio = minLen / maxLen;
  
  if (lower1.includes(lower2) || lower2.includes(lower1)) {
    // Only give high substring score if the words are similar in length
    if (lengthRatio >= 0.6) {
      return 90;
    }
    // For short substrings, score based on length ratio
    return Math.max(40, lengthRatio * 70);
  }
  
  // Calculate based on edit distance
  const distance = levenshteinDistance(lower1, lower2);
  
  // Convert distance to similarity percentage
  const similarity = ((maxLen - distance) / maxLen) * 100;
  
  return Math.max(0, similarity);
}

/**
 * Check if a text matches a search query with fuzzy matching
 * @param text - Text to search in (product name, description, etc.)
 * @param query - Search query
 * @param threshold - Minimum similarity score (0-100) to consider a match
 * @returns Object with match status and score
 */
export function fuzzyMatch(
  text: string | null | undefined,
  query: string,
  threshold: number = 75  // Raised from 70 to filter out false positives like "Eliminator" matching "Furminator"
): { matches: boolean; score: number } {
  if (!text || !query) {
    return { matches: false, score: 0 };
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  
  // FIRST: Check for exact substring match in full text (highest priority)
  if (lowerText.includes(lowerQuery)) {
    return { matches: true, score: 100 };
  }
  
  // Check each word in the query
  const queryWords = lowerQuery.split(/\s+/);
  let totalScore = 0;
  let matchedWords = 0;
  
  for (const queryWord of queryWords) {
    // Skip very short query words for fuzzy matching (require exact match)
    if (queryWord.length <= 2) {
      if (lowerText.includes(queryWord)) {
        matchedWords++;
        totalScore += 100;
      } else {
        totalScore += 0;
      }
      continue;
    }
    
    let bestScore = 0;
    
    // Check against each word in the text
    const textWords = lowerText.split(/\s+/);
    for (const textWord of textWords) {
      // For short text words, require exact match
      if (textWord.length <= 3) {
        if (textWord === queryWord) {
          bestScore = Math.max(bestScore, 100);
        }
      } else {
        // For longer words, use similarity scoring
        const score = similarityScore(textWord, queryWord);
        bestScore = Math.max(bestScore, score);
      }
    }
    
    // Also check if query word appears as substring in full text
    if (lowerText.includes(queryWord)) {
      bestScore = Math.max(bestScore, 95);
    }
    
    if (bestScore >= threshold) {
      matchedWords++;
    }
    totalScore += bestScore;
  }
  
  // Average score across all query words
  const avgScore = queryWords.length > 0 ? totalScore / queryWords.length : 0;
  
  // Match if average score is above threshold and at least some words matched
  const matches = avgScore >= threshold && matchedWords > 0;
  
  return { matches, score: avgScore };
}

/**
 * Filter and sort items by fuzzy search relevance
 * Includes brand name expansion to match abbreviated brand names
 * Example: searching "Diamond" will also match products with "Diam" in the name
 * Example: searching "Blue Buffalo" will also match products with "Blue B"
 * 
 * PRIORITY ORDER:
 * 1. Word boundary matches (score 250) - query matches as complete word in name ("Sour" in "Sour Apple")
 * 2. Substring matches (score 200) - query embedded in another word ("sour" in "NutriSource")
 * 3. Fuzzy name matches (score 100+) - typo-tolerant name matching
 * 4. Brand-only matches (score 50+) - query matches brand but not name
 * 
 * @param items - Array of items to search
 * @param query - Search query
 * @param getSearchableText - Function to extract searchable text from each item (first element should be name)
 * @param threshold - Minimum similarity score (default: 75)
 * @returns Filtered and sorted array of items with relevance scores
 */
export function fuzzySearchFilter<T>(
  items: T[],
  query: string,
  getSearchableText: (item: T) => string[],
  threshold: number = 75  // Raised from 70 to filter out false positives
): Array<T & { _relevance?: number }> {
  if (!query || !query.trim()) {
    return items;
  }
  
  const lowerQuery = query.toLowerCase().trim();
  
  // For full UPC/SKU searches (10+ digits), require EXACT match only
  // This prevents fuzzy matching between similar UPCs like 096316671461 vs 096316671478
  const digitsOnly = lowerQuery.replace(/\D/g, '');
  const isUpcSearch = digitsOnly.length >= 10 && digitsOnly === lowerQuery;
  
  if (isUpcSearch) {
    // Exact UPC/SKU matching only
    return items.filter(item => {
      const searchableTexts = getSearchableText(item);
      // Check SKU field (index 3) and UPC field (index 4) for exact match
      for (const text of searchableTexts) {
        if (text && text.toLowerCase() === lowerQuery) {
          return true;
        }
        // Also allow partial match if the query is the full UPC and text starts with it
        if (text && text.toLowerCase().includes(lowerQuery)) {
          return true;
        }
      }
      return false;
    }).map(item => ({ ...item, _relevance: 100 }));
  }
  
  // Expand brand names to include variations (e.g., "Diamond" → ["Diamond", "Diam"])
  const brandVariations = expandBrandNames(query);
  
  const resultsMap = new Map<any, number>(); // Track best score for each item
  
  // Search with each brand variation
  for (const searchQuery of brandVariations) {
    for (const item of items) {
      const searchableTexts = getSearchableText(item);
      let bestScore = resultsMap.get(item) || 0;
      
      // First field is NAME - give it highest priority
      const name = searchableTexts[0] || '';
      const lowerName = name.toLowerCase();
      
      // Check for exact/substring name match first (highest priority)
      if (lowerName.includes(lowerQuery)) {
        // Check if query matches as a complete word (word boundary match)
        // "sour" in "Sour Apple" = word match (score 250)
        // "sour" in "NutriSource" = substring only (score 200)
        const wordBoundaryRegex = new RegExp(`\\b${lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (wordBoundaryRegex.test(lowerName)) {
          // Query matches as a complete word - highest priority
          bestScore = Math.max(bestScore, 250);
        } else {
          // Query is just a substring within another word - lower priority
          bestScore = Math.max(bestScore, 200);
        }
      } else {
        // Check fuzzy name match
        const nameMatch = fuzzyMatch(name, searchQuery, threshold);
        if (nameMatch.matches) {
          // Fuzzy name match - boost by 50 points
          bestScore = Math.max(bestScore, 100 + nameMatch.score);
        }
      }
      
      // Check other fields (brand, description) with lower priority
      for (let i = 1; i < searchableTexts.length; i++) {
        const text = searchableTexts[i];
        const { matches, score } = fuzzyMatch(text, searchQuery, threshold);
        if (matches) {
          // Brand/description matches get base score (no boost)
          bestScore = Math.max(bestScore, score);
        }
      }
      
      if (bestScore > 0) {
        resultsMap.set(item, bestScore);
      }
    }
  }
  
  // Convert map to array with relevance scores
  const results: Array<T & { _relevance: number }> = Array.from(resultsMap.entries()).map(
    ([item, score]) => ({ ...item, _relevance: score })
  );
  
  // Sort by relevance (highest first)
  results.sort((a, b) => (b._relevance || 0) - (a._relevance || 0));
  
  return results;
}
