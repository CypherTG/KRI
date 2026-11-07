/**
 * Groups records by a signature so test residue is distinguishable from real
 * data at a glance. Read-only.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
if (!process.env.DATABASE_URL) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
    if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
  }
}

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, onnotice: () => {},
  ssl: /neon\.tech/i.test(process.env.DATABASE_URL) ? 'require' : undefined,
});

console.log('\n  client names, grouped:\n');
const clients = await sql`
  SELECT COALESCE(NULLIF(trim(first_name || ' ' || last_name), ''), '(blank)') AS who,
         COALESCE(company_name, '(none)') AS company,
         count(*)::int AS n
    FROM clients
   GROUP BY 1, 2
   ORDER BY n DESC, 1
   LIMIT 40`;
for (const c of clients) console.log(`  ${String(c.n).padStart(4)}  ${c.who}  @  ${c.company}`);

console.log('\n  company names, grouped:\n');
const companies = await sql`
  SELECT COALESCE(company_name, '(none)') AS name, count(*)::int AS n
    FROM companies
   GROUP BY 1 ORDER BY n DESC, 1 LIMIT 40`;
for (const c of companies) console.log(`  ${String(c.n).padStart(4)}  ${c.name}`);

console.log('\n  users:\n');
const users = await sql`
  SELECT email, display_name, is_admin, created_at FROM users ORDER BY created_at`;
for (const u of users) {
  console.log(`  ${u.email.padEnd(46)} admin=${String(u.is_admin).padEnd(5)} ${new Date(u.created_at).toISOString()}`);
}
console.log('');

await sql.end();
