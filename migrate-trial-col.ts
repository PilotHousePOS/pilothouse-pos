import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_warning_email_sent_at TIMESTAMP`);
  console.log('Migration applied');
}

main().catch(e => { console.error(e); process.exit(1); });
