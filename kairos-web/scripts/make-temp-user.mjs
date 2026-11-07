/**
 * Registers a throwaway non-administrator on an approved domain so the shared
 * pool check can run as an ordinary user, then removes it again.
 *
 *   node scripts/with-temp-user.mjs
 *
 * Used to verify that opening up the contact pool does not also grant
 * administrator rights, without needing a real colleague's password.
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

const base = (process.env.KAIROS_URL || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');
const stamp = Date.now();
const email = `poolcheck${stamp}@konstructum.com`;
const password = 'Pool-Check-Password-1';

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, onnotice: () => {},
  ssl: /neon\.tech/i.test(process.env.DATABASE_URL) ? 'require' : undefined,
});

const res = await fetch(`${base}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, displayName: 'Pool Check' }),
});
const body = await res.json();

if (res.status !== 201) {
  console.error(`\n  could not create the temporary account: ${res.status} ${body?.error || ''}\n`);
  await sql.end();
  process.exit(1);
}

console.log(`\n  KAIROS_EMAIL=${email}`);
console.log(`  KAIROS_PASSWORD=${password}\n`);

await sql.end();
process.exit(0);
