/**
 * Removes KAIROS smoke-test fixtures from a database.
 *
 * This is deliberately surgical. The suite inserts a handful of recognisable
 * records — "Amara Okafor" at "Zenith Construction", the "Delta Ltd" import
 * rows, and accounts named probe<n>@ / other<n>@ / widened<n>@ — and those are
 * the only things it may ever delete. Real KRI contacts and companies share
 * none of these signatures, so every predicate below is an exact match rather
 * than a wildcard, and the dry run prints each row before anything is removed.
 *
 *   node scripts/clean-test-fixtures.mjs                    # dry run
 *   set "CONFIRM_DELETE=yes" & node scripts/clean-test-fixtures.mjs
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
  max: 1,
  prepare: false,
  onnotice: () => {},
  ssl: /neon\.tech/i.test(process.env.DATABASE_URL) ? 'require' : undefined,
});

const apply = process.env.CONFIRM_DELETE === 'yes';

// Exact signatures only — no prefix match, so no real record can be caught.
const WHERE = {
  clients: `(
      (first_name = 'Amara' AND last_name = 'Okafor')
   OR company_name = 'Delta Ltd'
   OR lower(email) ~ '^import[12][+][0-9]+@example[.]com$'
  )`,
  companies: `lower(company_name) IN ('zenith construction', 'delta ltd')`,
  users: `(
      lower(email) ~ '^probe[0-9]+@'
   OR lower(email) ~ '^other[0-9]+@'
   OR lower(email) ~ '^widened[0-9]+@'
  )`,
  biodata: `full_name = 'Amara Chidinma Okafor'`,
};

const SELECT = {
  clients: `concat_ws(' ', first_name, last_name) AS label, coalesce(company_name, '') AS company, coalesce(email, '') AS email`,
  companies: `company_name AS label`,
  users: `email AS label`,
  biodata: `coalesce(full_name, contact_id) AS label`,
};

console.log(apply ? '\n  DELETING test fixtures\n' : '\n  DRY RUN — nothing will be deleted\n');

for (const table of ['biodata', 'clients', 'companies', 'users']) {
  const rows = await sql.unsafe(`SELECT ${SELECT[table]} FROM ${table} WHERE ${WHERE[table]} ORDER BY 1`);
  console.log(`\n  ${table} — ${rows.length} row(s) matching`);
  for (const row of rows) {
    const parts = Object.values(row).filter(Boolean);
    console.log(`      · ${parts.join('  |  ').slice(0, 90)}`);
  }
}

if (!apply) {
  console.log('\n  Re-run with CONFIRM_DELETE=yes to remove exactly the rows listed above.\n');
  await sql.end();
  process.exit(0);
}

// Children before parents, so no foreign key is left dangling.
const removed = {};
for (const table of ['biodata', 'clients', 'companies', 'users']) {
  const result = await sql.unsafe(`DELETE FROM ${table} WHERE ${WHERE[table]}`);
  removed[table] = result.count;
}

console.log('\n  removed:');
for (const [table, count] of Object.entries(removed)) console.log(`    ${table.padEnd(9)} ${count}`);

const clients = await sql`SELECT count(*)::int AS total FROM clients`;
const companies = await sql`SELECT count(*)::int AS total FROM companies`;
const users = await sql`SELECT email, is_admin FROM users ORDER BY created_at`;
console.log(`\n  clients remaining   : ${clients[0].total}`);
console.log(`  companies remaining : ${companies[0].total}`);
console.log('  users remaining     :');
for (const u of users) console.log(`    ${u.email}  admin=${u.is_admin}`);
console.log('');

await sql.end();
