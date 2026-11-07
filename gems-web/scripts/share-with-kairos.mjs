/**
 * Copies the shared configuration from KAIROS into GEMS.
 *
 * The two applications run as separate deployments but read and write the SAME
 * database, so they must agree on the pieces that make that safe:
 *
 *  · DATABASE_URL          — the same Neon database, which is the whole point.
 *  · SESSION_SECRET        — the same signing key. Sessions are per-domain so
 *                            this does not create a single sign-on, but a shared
 *                            secret means one credential works in both and a
 *                            token is not silently valid in only one.
 *  · BLOB_READ_WRITE_TOKEN — the same store, with GEMS files namespaced under
 *                            `gems/` by the API so the two apps cannot collide.
 *  · PERMISSIONS_MODE      — matched, so both apps behave the same way.
 *
 * GEMINI_API_KEY is deliberately not copied: it is unset on KAIROS too, and
 * copying an empty value would look configured.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const KAIROS = path.resolve(process.cwd(), '../kairos-web/.env.local');

/** Reads KEY=value from a dotenv file, tolerating quotes and CRLF. */
function readEnv(file, key) {
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*$`));
    if (match) return match[1].replace(/^["']|["']$/g, '');
  }
  return null;
}

if (!fs.existsSync(KAIROS)) {
  console.error(`\n  Cannot read ${KAIROS}. Run this from the GEMS project with KAIROS alongside it.\n`);
  process.exit(1);
}

/**
 * ADMIN_EMAILS is intentionally empty; only the pinned admin applies.
 *
 * SESSION_SECRET is deliberately NOT shared with KAIROS.
 *
 * The KAIROS production secret is encrypted in Vercel and unreadable from here,
 * so reading it from .env.local would have silently picked up the *development*
 * value — a constant that is committed in a file. Worse, sharing a signing key
 * between two applications means a session token minted in one is valid in the
 * other, which is a cross-application privilege path nobody asked for.
 *
 * Accounts still work in both: the two apps read the same `users` table and
 * verify the same bcrypt hashes. Only the session token is app-specific, and it
 * is per-domain anyway, so nothing is lost by keeping the keys apart.
 */
/**
 * Where the shared database connection string comes from.
 *
 * It is NOT read from KAIROS's .env.local. That file deliberately points at a
 * local throwaway database so the test suites can truncate freely, and copying
 * it verbatim deployed GEMS against 127.0.0.1:55555 — which fails at runtime
 * with a bare ECONNREFUSED and gives no hint that the configuration is wrong.
 *
 * So the production connection string is taken from the NEON_DATABASE_URL
 * environment variable, and a non-production host is rejected outright.
 */
function productionDatabaseUrl() {
  const url = process.env.NEON_DATABASE_URL || '';
  if (!url) {
    console.error('\n  NEON_DATABASE_URL is not set.');
    console.error('  Pass the Neon pooled connection string, for example:');
    console.error('    set "NEON_DATABASE_URL=postgresql://…" && node scripts/share-with-kairos.mjs\n');
    process.exit(1);
  }
  if (/127\.0\.0\.1|localhost|::1/.test(url)) {
    console.error('\n  Refusing: NEON_DATABASE_URL points at localhost.');
    console.error('  That is the throwaway database used by the test suites; deploying');
    console.error('  against it would fail in production with ECONNREFUSED.\n');
    process.exit(1);
  }
  return url;
}

const shared = [
  ['DATABASE_URL', productionDatabaseUrl()],
  ['BLOB_READ_WRITE_TOKEN', readEnv(KAIROS, 'BLOB_READ_WRITE_TOKEN')],
  ['PERMISSIONS_MODE', 'open'],
  ['GEMINI_MODEL', readEnv(KAIROS, 'GEMINI_MODEL') || 'gemini-2.0-flash'],
];

const generated = [
  ['SESSION_SECRET', randomBytes(48).toString('base64')],
];

const missing = shared.filter(([, value]) => !value).map(([key]) => key);
if (missing.length) {
  console.error(`\n  Could not read from KAIROS: ${missing.join(', ')}`);
  console.error('  Refusing to deploy GEMS with a partial configuration.\n');
  process.exit(1);
}

for (const [key, value] of [...shared, ...generated]) {
  console.log(`\n  setting ${key}…`);
  // shell:true is avoided because the Neon connection string contains `&`, which
  // the shell would split on — the variable would silently arrive truncated and
  // the deploy would fail with a confusing authentication error instead.
  const result = spawnSync(
    process.execPath,
    ['scripts/set-env.mjs', `${key}=${value}`, '--overwrite'],
    { stdio: 'inherit', shell: false },
  );
  if (result.status !== 0) {
    console.error(`\n  Failed to set ${key}. Aborting before any deploy.\n`);
    process.exit(1);
  }
}

console.log('\n  GEMS now shares KAIROS’s database and file store.');
console.log('  SESSION_SECRET is freshly generated and app-specific, so a GEMS');
console.log('  session token cannot be replayed against KAIROS.');
console.log('  GEMINI_API_KEY was not set — it is unset on KAIROS too, so AIROS');
console.log('  will report itself unconfigured rather than failing obscurely.\n');
