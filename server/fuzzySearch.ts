/**
 * Fuzzy search utility for typo-tolerant searching
 * Finds closest matches even with spelling mistakes
 */

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
  
  // Contains exact substring = 90
  if (lower1.includes(lower2) || lower2.includes(lower1)) return 90;
  
  // Calculate based on edit distance
  const distance = levenshteinDistance(lower1, lower2);
  const maxLen = Math.max(lower1.length, lower2.length);
  
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
  threshold: number = 70
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
 * @param items - Array of items to search
 * @param query - Search query
 * @param getSearchableText - Function to extract searchable text from each item
 * @param threshold - Minimum similarity score (default: 70)
 * @returns Filtered and sorted array of items with relevance scores
 */
export function fuzzySearchFilter<T>(
  items: T[],
  query: string,
  getSearchableText: (item: T) => string[],
  threshold: number = 70
): Array<T & { _relevance?: number }> {
  if (!query || !query.trim()) {
    return items;
  }
  
  const results: Array<T & { _relevance: number }> = [];
  
  for (const item of items) {
    const searchableTexts = getSearchableText(item);
    let bestScore = 0;
    
    // Check all searchable fields and take the best match
    for (const text of searchableTexts) {
      const { matches, score } = fuzzyMatch(text, query, threshold);
      if (matches) {
        bestScore = Math.max(bestScore, score);
      }
    }
    
    if (bestScore > 0) {
      results.push({ ...item, _relevance: bestScore });
    }
  }
  
  // Sort by relevance (highest first)
  results.sort((a, b) => (b._relevance || 0) - (a._relevance || 0));
  
  return results;
}
