/**
 * Marks pre-existing accounts as verified.
 *
 * Turning on verification retroactively would otherwise lock out every account
 * that already exists — the columns are new, so every current row has
 * `email_verified_at` NULL and nobody could sign in to prove otherwise.
 *
 * These accounts predate the feature and were created by an administrator, not
 * by a stranger, so treating them as proven is the correct call. It is still an
 * explicit, reviewed act rather than a silent default:
 *
 *   node scripts/backfill-verification.mjs            # dry run, lists them
 *   set "CONFIRM=yes" & node scripts/backfill-verification.mjs
 *
 * Optionally restrict to named addresses:
 *   set "EMAILS=a@x.com,b@x.com" & node scripts/backfill-verification.mjs
 */
import fs from 'node:fs';
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
  console.error('\n  DATABASE_URL is not set.\n');
  process.exit(1);
}

const apply = process.env.CONFIRM === 'yes';
const allow = String(process.env.EMAILS || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
  ssl: /neon\.tech|neon\.build/i.test(process.env.DATABASE_URL) ? 'require' : undefined,
});

const pending = await sql`
  SELECT id, email, display_name, is_admin, created_at, verification_sent_count
    FROM users
   WHERE email_verified_at IS NULL
   ORDER BY created_at`;

const targets = allow.length
  ? pending.filter((row) => allow.includes(String(row.email || '').toLowerCase()))
  : pending;

console.log(apply ? '\n  BACKFILLING\n' : '\n  DRY RUN — nothing will be changed\n');
console.log(`  ${pending.length} account(s) are unverified; ${targets.length} in scope.\n`);

if (!targets.length) {
  console.log('  Nothing to do.\n');
  await sql.end();
  process.exit(0);
}

for (const row of targets) {
  console.log(`  ${String(row.email).padEnd(42)} admin=${String(row.is_admin).padEnd(6)} ${new Date(row.created_at).toISOString().slice(0, 10)}`);
}

if (allow.length) {
  const skipped = pending.filter((row) => !allow.includes(String(row.email || '').toLowerCase()));
  for (const row of skipped) console.log(`  (not in scope) ${row.email}`);
}

if (!apply) {
  console.log('\n  Re-run with CONFIRM=yes to mark these accounts verified.\n');
  await sql.end();
  process.exit(0);
}

const ids = targets.map((row) => row.id);
const updated = await sql`
  UPDATE users
     SET email_verified_at = COALESCE(email_verified_at, now()),
         verification_token_hash = NULL,
         verification_token_expires_at = NULL
   WHERE id = ANY(${ids}::text[])
   RETURNING email`;

console.log(`\n  verified ${updated.length} account(s)\n`);

const stillPending = await sql`SELECT count(*)::int AS n FROM users WHERE email_verified_at IS NULL`;
if (stillPending[0].n > 0) {
  console.log(`  ${stillPending[0].n} account(s) remain unverified and will need a code.`);
  console.log('  That is correct for any account that was never proven.\n');
} else {
  console.log('  no accounts remain unverified\n');
}

await sql.end();
