/** Shows the distinct department/title values the family filter is derived from. */
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
  SELECT coalesce(nullif(trim(department), ''), '(empty)')  AS department,
         coalesce(nullif(trim(title), ''), '(empty)')        AS title,
         coalesce(nullif(trim(job_title), ''), '(empty)')    AS job_title,
         count(*)::int AS n
    FROM users
   GROUP BY 1,2,3
   ORDER BY n DESC`;

console.log(`\n  ${rows.length} distinct user department/title combination(s)\n`);
for (const r of rows) {
  console.log(`  ${String(r.n).padStart(3)}  dept=${r.department.padEnd(24)} title=${r.title.padEnd(24)} job=${r.job_title}`);
}

const distinctDepartments = await sql`
  SELECT DISTINCT coalesce(nullif(trim(department), ''), '(empty)') AS d
    FROM users ORDER BY 1`;
console.log('\n  distinct department values:');
for (const d of distinctDepartments) console.log(`    ${JSON.stringify(d.d)}`);
console.log('');

await sql.end();
