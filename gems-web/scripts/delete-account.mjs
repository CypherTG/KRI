/**
 * Removes an account. Intended for offboarding and for cleaning up test
 * accounts; it is the counterpart to set-password.mjs.
 *
 * Refuses the pinned administrator so an accident cannot lock the system out,
 * and always reports what it removed.
 *
 * Usage:
 *   set "DATABASE_URL=<neon url>"
 *   set "KAIROS_EMAIL=<account to remove>"
 *   set "CONFIRM_DELETE=yes"
 *   node scripts/delete-account.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const email = (process.env.KAIROS_EMAIL || '').trim().toLowerCase();

if (!email) {
  console.error('Set KAIROS_EMAIL to the account to remove.');
  process.exit(1);
}
if (process.env.CONFIRM_DELETE !== 'yes') {
  console.error('Set CONFIRM_DELETE=yes to confirm this permanently deletes the account.');
  process.exit(1);
}

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const rows = await sql`SELECT id, email, is_admin FROM users WHERE lower(email) = ${email}`;

if (!rows.length) {
  console.error(`No account exists for ${email}.`);
  await sql.end();
  process.exit(1);
}

const user = rows[0];

if (user.is_admin) {
  console.error(`Refusing to delete ${email} because it is an administrator.`);
  console.error('Demote the account from KAIROS → Settings first if you really mean to remove it.');
  await sql.end();
  process.exit(1);
}

// Contacts are retained but become unowned, which is the safe outcome: the
// relationship history is not destroyed along with the login.
const released = await sql`
  UPDATE clients SET primary_contact_id = NULL WHERE primary_contact_id = ${user.id}
  RETURNING id`;

// `requester_id` is declared ON DELETE CASCADE, so requests the user raised
// disappear with them. `response_by` is a free-text key rather than a foreign
// key, so it is cleared explicitly.
await sql`UPDATE contact_access_requests SET response_by = NULL WHERE response_by = ${user.id}`;
await sql`DELETE FROM users WHERE id = ${user.id}`;

console.log('');
console.log(`  removed   : ${user.email}`);
console.log(`  contacts released back to unowned: ${released.length}`);
console.log('');

await sql.end();
