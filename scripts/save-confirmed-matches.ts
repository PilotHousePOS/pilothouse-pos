import { db } from "../server/db";
import { supplies } from "../shared/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";

async function main() {
  const withUpc = await db.select({
    id: supplies.id,
    name: supplies.name,
    upc: supplies.upc
  }).from(supplies).where(sql`${supplies.upc} IS NOT NULL`);
  
  const matches = withUpc.map(s => ({
    supplyId: s.id,
    supplyName: s.name,
    upc: s.upc
  }));
  
  fs.writeFileSync('scripts/confirmed_upc_matches.json', JSON.stringify({
    savedAt: new Date().toISOString(),
    count: matches.length,
    matches
  }, null, 2));
  
  console.log(`Saved ${matches.length} confirmed matches`);
  process.exit(0);
}

main().catch(console.error);
