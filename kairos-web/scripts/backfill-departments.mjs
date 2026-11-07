/**
 * Backfills users.department from each account's email domain.
 *
 * The Groups Leaderboard filter derives a person's family, and until now it
 * read only the `department` column — which nothing in the UI ever set, so the
 * column was empty for every account and every family chip returned "No users
 * found". The filter now derives the family from the email domain (authoritative,
 * and enforced at registration), so this backfill is about consistency: the
 * department also appears in the header subtitle, Settings, My Profile and the
 * AIROS context, and should not be blank.
 *
 * Idempotent — it only fills a blank department and never overwrites one that
 * has been set deliberately. The founding administrator's personal address maps
 * to no company domain, so they are given the default below, which is
 * overridable in Settings.
 *
 *   node scripts/backfill-departments.mjs            # dry run
 *   set "CONFIRM_WRITE=yes" & node scripts/backfill-departments.mjs
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
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const DOMAIN_TO_FAMILY = {
  'konstructum.com': 'Konstructum',
  'pmt7integrated.com': 'PMT7 Integrated',
  'interkonstruct.com': 'Interkonstruct',
  'ngneeredprojects.com': 'NGneered Projects',
};

// The founding administrator holds a personal address, so no domain applies.
const DEFAULT_FAMILY = 'Konstructum';

const apply = process.env.CONFIRM_WRITE === 'yes';

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, onnotice: () => {},
  ssl: /neon\.tech/i.test(process.env.DATABASE_URL) ? 'require' : undefined,
});

function familyFor(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at === -1) return DEFAULT_FAMILY;
  return DOMAIN_TO_FAMILY[String(email).slice(at + 1).toLowerCase()] || DEFAULT_FAMILY;
}

const users = await sql`
  SELECT id, email, display_name, coalesce(nullif(trim(department), ''), '') AS department
    FROM users
   ORDER BY created_at`;

const plan = users
  .map((user) => ({ ...user, next: familyFor(user.email) }))
  .filter((user) => user.department !== user.next);

console.log(apply ? '\n  WRITING\n' : '\n  DRY RUN — nothing will be written\n');
if (!plan.length) {
  console.log('  every account already has a department; nothing to do.\n');
  await sql.end();
  process.exit(0);
}

for (const user of plan) {
  const from = user.department || '(blank)';
  console.log(`  ${user.email}`);
  console.log(`      ${from}  ->  ${user.next}`);
}

if (!apply) {
  console.log('\n  Re-run with CONFIRM_WRITE=yes to apply the above.\n');
  await sql.end();
  process.exit(0);
}

for (const user of plan) {
  await sql`UPDATE users SET department = ${user.next} WHERE id = ${user.id}`;
}
console.log(`\n  updated ${plan.length} account(s)\n`);

await sql.end();
