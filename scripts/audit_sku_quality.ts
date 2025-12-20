import { db } from '../server/db';
import { supplies } from '../shared/schema';
import { sql, isNotNull } from 'drizzle-orm';
import * as fs from 'fs';

const BRAND_PREFIXES: Record<string, string[]> = {
  'api': ['317163', '017163'],
  'aqueon': ['015905'],
  'coastal': ['076484'],
  'ethical': ['077234'],
  'ethical pet': ['077234'],
  'exo terra': ['015561'],
  'flukers': ['091197'],
  'fluval': ['015561', '155611'],
  'glofish': ['046798'],
  'hikari': ['042055'],
  'kaytee': ['071859', '045125'],
  'kong': ['035585'],
  'lil pals': ['076484', '744845'],
  'marina': ['015561'],
  'marineland': ['046798'],
  'nylabone': ['018214'],
  'oxbow': ['744845'],
  'penn-plax': ['030172', '048081'],
  'reptology': ['030172'],
  'birdlife': ['030172'],
  'seachem': ['000116'],
  'spot': ['077234'],
  'tetra': ['046798'],
  'tropiclear': ['645095'],
  'tropiclean': ['645095'],
  'zilla': ['096316'],
  'zoo med': ['097612'],
  'science diet': ['797801', '052742'],
  'primal': ['850334'],
  'freshpet': ['627975'],
  'friskies': ['050000'],
  'fancy feast': ['050000'],
  'purina': ['038100', '017800'],
  'blue buffalo': ['840243', '859610'],
  'wellness': ['076344'],
  'natural balance': ['723633'],
  'nutrisource': ['066380'],
  'fromm': ['660204'],
  'orijen': ['064992'],
  'acana': ['064992'],
};

interface AuditResult {
  id: number;
  name: string;
  brand: string | null;
  sku: string;
  expectedPrefixes: string[];
  actualPrefix: string;
  isValid: boolean;
  issue: string;
}

async function main() {
  console.log('Loading products with SKUs...');
  
  const products = await db.select({
    id: supplies.id,
    name: supplies.name,
    brand: supplies.brand,
    sku: supplies.sku,
  }).from(supplies).where(isNotNull(supplies.sku));
  
  console.log(`Found ${products.length} products with SKUs`);

  const issues: AuditResult[] = [];
  const byBrand: Record<string, { total: number; valid: number }> = {};

  for (const product of products) {
    if (!product.sku) continue;
    
    const brand = (product.brand || '').toLowerCase().trim();
    const prefix = product.sku.substring(0, 6);
    const expectedPrefixes = BRAND_PREFIXES[brand] || [];
    
    if (!byBrand[brand]) byBrand[brand] = { total: 0, valid: 0 };
    byBrand[brand].total++;
    
    let isValid = true;
    let issue = '';
    
    if (expectedPrefixes.length > 0 && !expectedPrefixes.includes(prefix)) {
      isValid = false;
      issue = `Expected prefix ${expectedPrefixes.join('/')} but got ${prefix}`;
    }
    
    if (!isValid) {
      issues.push({
        id: product.id,
        name: product.name,
        brand: product.brand,
        sku: product.sku,
        expectedPrefixes,
        actualPrefix: prefix,
        isValid,
        issue,
      });
    } else {
      byBrand[brand].valid++;
    }
  }

  console.log(`\nTotal products with SKUs: ${products.length}`);
  console.log(`Products with potential prefix mismatches: ${issues.length}`);
  console.log(`Accuracy rate: ${((products.length - issues.length) / products.length * 100).toFixed(1)}%`);

  console.log('\n=== BRAND SUMMARY ===');
  const brandEntries = Object.entries(byBrand)
    .filter(([_, v]) => v.total > 5)
    .sort((a, b) => b[1].total - a[1].total);
  
  for (const [brand, stats] of brandEntries.slice(0, 20)) {
    const pct = (stats.valid / stats.total * 100).toFixed(0);
    console.log(`  ${brand || '(no brand)'}: ${stats.valid}/${stats.total} valid (${pct}%)`);
  }

  console.log('\n=== SAMPLE ISSUES ===');
  issues.slice(0, 15).forEach(i => {
    console.log(`  [${i.brand}] ${i.name.substring(0, 40)}`);
    console.log(`    SKU: ${i.sku} - ${i.issue}`);
  });

  fs.writeFileSync('/tmp/sku_audit_results.json', JSON.stringify({
    totalWithSku: products.length,
    issueCount: issues.length,
    accuracyRate: ((products.length - issues.length) / products.length * 100).toFixed(1),
    issues: issues.slice(0, 100),
    brandSummary: byBrand,
  }, null, 2));
  
  console.log('\nFull results saved to /tmp/sku_audit_results.json');
}

main().catch(console.error);
