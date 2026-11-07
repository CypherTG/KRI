/**
 * Counts how much of the shared contact registry falls inside GEMS scope.
 *
 * GEMS is limited to a fixed set of agencies (gemsScope.ts in the original
 * source). Because GEMS reads the same `clients` table as KAIROS, this decides
 * how much data the new app will actually show.
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

const AGENCIES = ['NUPRC', 'NUIMS', 'NCDMB', 'NEPL', 'NNPC', 'NIMASA', 'ENSERV', 'NMDPRA'];

// Mirrors normalizeGemsAgency(): strip non-alphanumerics, then substring match,
// with NEPL/NNPC resolved first so NNPC cannot be swallowed by an earlier entry.
function normalize(value) {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!key) return '';
  if (key.includes('nepl')) return 'NEPL';
  if (key.includes('nnpc')) return 'NNPC';
  return AGENCIES.find((a) => key.includes(a.toLowerCase())) || '';
}

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, onnotice: () => {},
  ssl: /neon\.tech/i.test(process.env.DATABASE_URL) ? 'require' : undefined,
});

const total = await sql`SELECT count(*)::int AS n FROM clients`;
console.log(`\n  contacts in the shared registry: ${total[0].n}\n`);

const byAgency = Object.fromEntries(AGENCIES.map((a) => [a, []]));
let matched = 0;

const rows = await sql`
  SELECT first_name, last_name, company_name
    FROM clients
   ORDER BY company_name NULLS LAST`;

for (const row of rows) {
  const agency = normalize(row.company_name || row.first_name);
  if (!agency) continue;
  matched++;
  byAgency[agency].push(
    `${(row.first_name || '').trim()} ${(row.last_name || '').trim()}`.trim() || '(no name)',
  );
}

console.log('  contacts in GEMS scope:\n');
for (const agency of AGENCIES) {
  const list = byAgency[agency];
  console.log(`  ${agency.padEnd(9)} ${String(list.length).padStart(3)}`);
  for (const name of list.slice(0, 8)) console.log(`      · ${name}`);
  if (list.length > 8) console.log(`      · …and ${list.length - 8} more`);
  console.log('');
}

console.log(`  in scope: ${matched} of ${total[0].n} (${((matched / total[0].n) * 100).toFixed(1)}%)\n`);

await sql.end();
