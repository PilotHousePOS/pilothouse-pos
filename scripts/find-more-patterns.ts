import * as fs from "fs";
import { expandAbbreviations } from "../server/abbreviationExpansion";

const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));

// Find short words that aren't being expanded
const unexpanded: Record<string, { count: number, examples: string[] }> = {};

for (const entry of masterData.entries) {
  const original = entry.name;
  const expanded = expandAbbreviations(original);
  
  // Find words that stayed the same (potential unexpanded abbreviations)
  const origWords = original.split(/\s+/);
  const expWords = expanded.split(/\s+/);
  
  origWords.forEach((word: string, i: number) => {
    // If word is short (2-6 chars) and wasn't expanded and is all letters
    if (word.length >= 2 && word.length <= 6 && /^[a-zA-Z]+$/.test(word)) {
      if (expWords[i] && word.toLowerCase() === expWords[i].toLowerCase()) {
        const key = word.toLowerCase();
        if (!unexpanded[key]) {
          unexpanded[key] = { count: 0, examples: [] };
        }
        unexpanded[key].count++;
        if (unexpanded[key].examples.length < 3) {
          unexpanded[key].examples.push(original);
        }
      }
    }
  });
}

// Sort by frequency and show common ones
const sorted = Object.entries(unexpanded)
  .filter(([_, v]) => v.count >= 10)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 60);

console.log("=== COMMON UNEXPANDED ABBREVIATIONS (10+ occurrences) ===\n");
sorted.forEach(([word, { count, examples }]) => {
  console.log(`${word}: ${count} times`);
  examples.forEach(ex => console.log(`  - "${ex}"`));
});

