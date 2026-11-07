/** Distinct business_arms values across the client registry. Read-only. */
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

const rows = await sql`
  SELECT arm, count(*)::int AS n
    FROM clients, unnest(coalesce(business_arms, '{}')) AS arm
   GROUP BY arm ORDER BY n DESC`;

console.log(`\n  distinct business_arms values across the registry\n`);
for (const r of rows) console.log(`  ${String(r.n).padStart(4)}  ${JSON.stringify(r.arm)}`);

const empty = await sql`SELECT count(*)::int AS n FROM clients WHERE business_arms IS NULL OR cardinality(business_arms) = 0`;
console.log(`\n  clients with no business arm: ${empty[0].n}\n`);

await sql.end();
