/**
 * Capitalizes the first letter of each word in a string
 * @param text - The text to capitalize
 * @returns The text with first letters capitalized
 */
export function capitalizeWords(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Capitalizes just the first letter of a string
 * @param text - The text to capitalize
 * @returns The text with first letter capitalized
 */
export function capitalizeFirst(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
