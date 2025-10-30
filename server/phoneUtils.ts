/**
 * Utility functions for phone number handling
 */

/**
 * Extract phone numbers from text using various common formats
 * Supports formats like:
 * - (555) 123-4567
 * - 555-123-4567
 * - 555.123.4567
 * - 5551234567
 * - +1-555-123-4567
 */
export function extractPhoneNumbers(text: string): string[] {
  if (!text) return [];

  // Common phone number patterns
  const patterns = [
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,  // (555) 123-4567 or 555-123-4567
    /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,  // +1-555-123-4567
    /\d{10}/g,  // 5551234567
  ];

  const found: Set<string> = new Set();

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // Clean up the phone number (remove non-digits except +)
        const cleaned = match.replace(/[^\d+]/g, '');
        if (cleaned.length >= 10) {
          found.add(formatPhoneNumber(match));
        }
      });
    }
  }

  return Array.from(found);
}

/**
 * Normalize phone number to a standard format for comparison
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  // Remove all non-digits
  return phone.replace(/\D/g, '');
}

/**
 * Format phone number to a readable format (555) 123-4567
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  
  return phone; // Return original if can't format
}

/**
 * Check if two phone numbers match (ignoring formatting)
 */
export function phoneNumbersMatch(phone1: string, phone2: string): boolean {
  if (!phone1 || !phone2) return false;
  const norm1 = normalizePhoneNumber(phone1);
  const norm2 = normalizePhoneNumber(phone2);
  
  // Compare last 10 digits (ignore country code)
  const digits1 = norm1.slice(-10);
  const digits2 = norm2.slice(-10);
  
  return digits1 === digits2 && digits1.length === 10;
}
