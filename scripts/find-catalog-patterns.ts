import * as fs from "fs";
import { expandAbbreviations } from "../server/abbreviationExpansion";

const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));

// Look at catalog entries for problematic brands
const patterns = [
  { search: 'science diet', brand: 'Science Diet' },
  { search: 'sd ', brand: 'Science Diet' },
  { search: 'coastal', brand: 'Coastal' },
  { search: 'blue', brand: 'Blue Buffalo' },
  { search: 'bb ', brand: 'Blue Buffalo' },
  { search: 'oxbow', brand: 'Oxbow' },
  { search: 'fluval', brand: 'Fluval' },
  { search: 'kaytee', brand: 'Kaytee' },
  { search: 'greenies', brand: 'Greenies' },
  { search: 'kong', brand: 'Kong' },
];

console.log("=== CATALOG ABBREVIATION PATTERNS ===\n");

for (const { search, brand } of patterns) {
  const entries = masterData.entries.filter((e: any) => 
    e.name.toLowerCase().includes(search)
  ).slice(0, 10);
  
  if (entries.length > 0) {
    console.log(`\n--- ${brand} (search: "${search}") ---`);
    entries.forEach((e: any) => {
      const expanded = expandAbbreviations(e.name);
      const diff = e.name !== expanded ? ` -> "${expanded}"` : '';
      console.log(`  "${e.name}"${diff}`);
    });
  }
}

// Find common abbreviation patterns in catalog
console.log("\n\n=== COMMON ABBREVIATION PATTERNS ===");
const abbrevPatterns: Record<string, number> = {};
masterData.entries.forEach((e: any) => {
  const words = e.name.split(/\s+/);
  words.forEach((w: string) => {
    if (w.length <= 4 && w.length >= 2 && /^[a-zA-Z]+$/.test(w)) {
      abbrevPatterns[w.toLowerCase()] = (abbrevPatterns[w.toLowerCase()] || 0) + 1;
    }
  });
});

const sortedAbbrevs = Object.entries(abbrevPatterns)
  .filter(([_, count]) => count >= 5)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50);

console.log("\nMost common short words (potential abbreviations):");
sortedAbbrevs.forEach(([word, count]) => {
  const expanded = expandAbbreviations(word);
  const status = word !== expanded.toLowerCase() ? `-> ${expanded}` : '(NOT EXPANDED)';
  console.log(`  ${word}: ${count} occurrences ${status}`);
});

