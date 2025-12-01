import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql } from 'drizzle-orm';

async function runExtremeAudit() {
  console.log("=".repeat(60));
  console.log("EXTREME AUDIT - 14 Quality Checks");
  console.log("=".repeat(60));
  
  // Get all supplies
  const allSupplies = await db.select().from(supplies);
  console.log(`\nTotal products: ${allSupplies.length.toLocaleString()}\n`);
  
  const checks = [
    { name: "Zoo Medium variants", test: (n: string) => /\bZoo Medium\b/i.test(n) },
    { name: "Bluebuffalo concatenation", test: (n: string) => /\bBluebuffalo\b/i.test(n) },
    { name: "Ampersand lowercase after", test: (n: string) => /&\s+[a-z]/.test(n) },
    { name: "Zoomed/ZooMed/Zoomd variants", test: (n: string) => /\b(Zoomed|ZooMed|Zoomd)\b/.test(n) },
    { name: "Pethonesty missing spacing", test: (n: string) => /\bPethonesty\b/i.test(n) },
    { name: "Ylw abbreviation", test: (n: string) => /\bYlw\b/i.test(n) },
    { name: "Gry abbreviation", test: (n: string) => /\bGry\b/i.test(n) },
    { name: "Snk abbreviation", test: (n: string) => /\bSnk\b/i.test(n) },
    { name: "Ckn abbreviation", test: (n: string) => /\bCkn\b/i.test(n) },
    { name: "Carr abbreviation (not Carrot)", test: (n: string) => /\bCarr\b(?!\w)/i.test(n) && !/Carrot/i.test(n) },
    { name: "Med size abbreviation", test: (n: string) => /\bMed\b(?!\s*\d)/i.test(n) && !/Medium|Medicine|Medic|Medal/i.test(n) },
    { name: "Sm size abbreviation", test: (n: string) => /\bSm\b(?!\s*\d)/i.test(n) && !/Small|Smoke|Smart/i.test(n) },
    { name: "Lg size abbreviation", test: (n: string) => /\bLg\b(?!\s*\d)/i.test(n) && !/Large/i.test(n) },
    { name: "Missing brand assignment", test: null },
  ];
  
  const results: { check: string; count: number; examples: string[] }[] = [];
  
  for (const check of checks) {
    if (check.name === "Missing brand assignment") {
      const missingBrand = allSupplies.filter(s => !s.brand || s.brand.trim() === '');
      results.push({
        check: check.name,
        count: missingBrand.length,
        examples: missingBrand.slice(0, 3).map(s => `[${s.id}] ${s.name}`)
      });
    } else if (check.test) {
      const matches = allSupplies.filter(s => check.test!(s.name));
      results.push({
        check: check.name,
        count: matches.length,
        examples: matches.slice(0, 3).map(s => `[${s.id}] ${s.name}`)
      });
    }
  }
  
  // Display results
  console.log("─".repeat(60));
  let totalIssues = 0;
  for (const result of results) {
    const status = result.count === 0 ? "✓" : "✗";
    const color = result.count === 0 ? "" : "";
    console.log(`${status} ${result.check}: ${result.count} issues`);
    if (result.count > 0 && result.examples.length > 0) {
      result.examples.forEach(ex => console.log(`    → ${ex.substring(0, 70)}${ex.length > 70 ? '...' : ''}`));
    }
    totalIssues += result.count;
  }
  
  console.log("─".repeat(60));
  console.log(`\nTOTAL ISSUES: ${totalIssues}`);
  console.log("=".repeat(60));
  
  // Brand coverage stats
  const withBrand = allSupplies.filter(s => s.brand && s.brand.trim() !== '');
  const brandCoverage = ((withBrand.length / allSupplies.length) * 100).toFixed(2);
  console.log(`\nBrand Coverage: ${withBrand.length.toLocaleString()}/${allSupplies.length.toLocaleString()} (${brandCoverage}%)`);
  
  // Summary verdict
  if (totalIssues === 0) {
    console.log("\n🎉 ALL 14 CHECKS PASSED - System is clean!");
  } else {
    console.log(`\n⚠️  ${totalIssues} issues require attention`);
  }
}

runExtremeAudit().catch(console.error).finally(() => process.exit(0));
