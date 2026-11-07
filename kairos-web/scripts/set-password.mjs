/**
 * Sets the password for an existing account, or creates it if absent.
 *
 * The account must already exist; this is deliberately not a "create anyone an
 * admin" tool, so it refuses to invent a missing account. It reuses the
 * application's own hashPassword so a password set here is indistinguishable
 * from one set through the sign-in form.
 *
 * Usage:
 *   set "DATABASE_URL=<neon url>"
 *   set "KAIROS_EMAIL=onechief011@gmail.com"
 *   set "KAIROS_PASSWORD=<the new password>"
 *   node scripts/set-password.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

// The auth library needs DATABASE_URL only when a request arrives, so loading it
// here is safe before the environment is assembled.
const { hashPassword, verifyPassword } = await import(
  pathToFileURL(path.resolve('api/_lib/auth.ts')).href
);

if (!fs.existsSync('.env.local') && !process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const email = (process.env.KAIROS_EMAIL || '').trim().toLowerCase();
const password = process.env.KAIROS_PASSWORD || '';

if (!email) {
  console.error('Set KAIROS_EMAIL to the account to update.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

const existing = await sql`SELECT id, email, is_admin FROM users WHERE lower(email) = ${email}`;

if (!existing.length) {
  console.error(`No account exists for ${email}. Create it from the "Create account" tab first.`);
  await sql.end();
  process.exit(1);
}

const user = existing[0];
const hash = await hashPassword(password);

await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${user.id}`;

// Read it back and verify, so success means the stored hash really matches.
const verify = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`;
const matches = await verifyPassword(password, verify[0].password_hash);

console.log('');
console.log(`  account : ${user.email}`);
console.log(`  admin   : ${user.is_admin}`);
console.log(`  updated : ${matches ? 'password set and verified against the stored hash' : 'FAILED TO VERIFY'}`);
console.log('');

await sql.end();
process.exit(matches ? 0 : 1);
