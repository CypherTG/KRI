/**
 * Reports what is actually in the database, per table, so test residue is
 * visible. Read-only: this never modifies anything.
 *
 *   set "DATABASE_URL=..."  node scripts/inspect-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

if (!process.env.DATABASE_URL) {
  for (const file of ['.env.local', '.env']) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*?)\s*$/);
      if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
    }
  }
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set and none found in .env.local');
  process.exit(1);
}

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
  ssl: /neon\.tech|neon\.build/i.test(process.env.DATABASE_URL) ? 'require' : undefined,
});

const TABLES = [
  'users', 'clients', 'communications', 'engagements', 'automations',
  'stage_history', 'companies', 'projects', 'job_titles', 'company_acumen',
  'biodata', 'contact_access_requests',
];

console.log(`\n  ${new URL(process.env.DATABASE_URL).hostname}\n`);

for (const table of TABLES) {
  const result = await sql.unsafe(`SELECT count(*)::int AS total FROM ${table}`);
  const total = result[0]?.total ?? 0;
  console.log(`  ${String(total).padStart(4)}  ${table}`);
  if (total > 0 && total <= 25) {
    const preview = await sql.unsafe(
      `SELECT * FROM ${table} ORDER BY created_at DESC NULLS LAST LIMIT 25`,
    );
    for (const row of preview) {
      const label = row.email || row.title || row.full_name
        || `${row.first_name || ''} ${row.last_name || ''}`.trim()
        || row.company_name || row.name || row.client_name
        || row.changed_by || row.type || row.job_title || row.list_type
        || row.id;
      console.log(`          · ${String(label).slice(0, 70)}`);
    }
  }
}
console.log('');

await sql.end();
