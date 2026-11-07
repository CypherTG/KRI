/** Lists the accounts that actually exist in the database. Passwords are never read back. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Reuse the project's DATABASE_URL the same way the app does.
for (const candidate of ['.env.local', '.env']) {
  if (!fs.existsSync(candidate)) continue;
  for (const line of fs.readFileSync(candidate, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
    if (m && !process.env.DATABASE_URL) {
      process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not found in .env.local or the environment.');
  process.exit(1);
}

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require', prepare: false, onnotice: () => {} });

const rows = await sql`
  SELECT email, display_name, is_active, is_admin, created_at
    FROM users
   ORDER BY created_at`;

console.log(`\n${rows.length} account(s) in the database:\n`);
for (const r of rows) {
  console.log(`  ${r.email}`);
  console.log(`     name      : ${r.display_name || '(none)'}`);
  console.log(`     active    : ${r.is_active}`);
  console.log(`     admin     : ${r.is_admin}`);
  console.log(`     created   : ${new Date(r.created_at).toISOString()}`);
}
console.log('');

await sql.end();
