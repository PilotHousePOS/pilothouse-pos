import * as fs from "fs";
import { expandAbbreviations } from "../server/abbreviationExpansion";

const masterData = JSON.parse(fs.readFileSync('scripts/master_upc_index.json', 'utf-8'));

// Check Science Diet catalog entries specifically
const sdEntries = masterData.entries.filter((e: any) => 
  e.name.toLowerCase().startsWith('sd ') || 
  e.name.toLowerCase().includes('science diet')
);

console.log(`=== ALL SCIENCE DIET CATALOG ENTRIES (${sdEntries.length}) ===\n`);

sdEntries.slice(0, 50).forEach((e: any) => {
  const expanded = expandAbbreviations(e.name);
  console.log(`"${e.name}"`);
  console.log(`  -> "${expanded}"`);
});

