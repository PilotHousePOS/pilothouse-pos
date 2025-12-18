import { db } from '../db';
import { supplies } from '../../shared/schema';
import { ilike, or } from 'drizzle-orm';

// Sample searches from the unmatched items
const searches = [
  { term: 'hikari cichlid gold', desc: 'Hikari Cichlid Gold' },
  { term: 'seachem prime', desc: 'Seachem Prime' },
  { term: 'hikari algae wafer', desc: 'Hikari Algae Wafers' },
  { term: 'zoo med creature', desc: 'Zoo Med Creatures' },
  { term: 'greenies dental', desc: 'Greenies Dental Treats' },
  { term: 'carefresh color', desc: 'Carefresh Colors Bedding' },
  { term: 'oxbow timothy', desc: 'Oxbow Timothy' },
  { term: 'aspen snake', desc: 'Aspen Snake Bedding' },
  { term: 'reptisun', desc: 'ReptiSun Bulbs/Hoods' },
  { term: 'gravel rainbow', desc: 'Rainbow Gravel' },
  { term: 'silent spinner', desc: 'Silent Spinner Wheel' },
  { term: 'crittertrail', desc: 'CritterTrail' },
  { term: 'pill pocket', desc: 'Pill Pockets' },
  { term: 'hikari frozen', desc: 'Hikari Frozen Foods' },
  { term: 'tortoise hay', desc: 'Tortoise Hay' },
];

async function main() {
  console.log('Searching database for sample products...\n');
  
  for (const search of searches) {
    const words = search.term.split(' ');
    const results = await db.select({ id: supplies.id, name: supplies.name, sku: supplies.sku })
      .from(supplies)
      .where(
        or(
          ilike(supplies.name, `%${search.term}%`),
          ...words.map(w => ilike(supplies.name, `%${w}%`))
        )
      )
      .limit(5);
    
    // Filter to products that contain ALL words
    const filtered = results.filter(r => 
      words.every(w => r.name.toLowerCase().includes(w.toLowerCase()))
    );
    
    console.log(`=== ${search.desc} ===`);
    if (filtered.length > 0) {
      filtered.forEach(r => console.log(`  [${r.sku || 'NO SKU'}] ${r.name}`));
    } else {
      console.log('  NOT FOUND');
    }
    console.log();
  }
}

main().catch(console.error);
