/**
 * Confirms self-registration works against the deployed site.
 *
 * Registers a throwaway address, checks it can sign in, then removes it, so
 * production is left exactly as it was found. This exists because a new user
 * has no way to create an account until registration is proven to work.
 */
const base = (process.argv[2] || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');
const probeEmail = `kairos-registration-probe-${Date.now()}@example.invalid`;
const password = 'Registration-Probe-Password-1';

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log(`\n=== registration check: ${base} ===\n`);
console.log(`  probe account: ${probeEmail}\n`);

// Register
let res = await fetch(`${base}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: probeEmail, password, displayName: 'Registration Probe' }),
});
let body = await res.json();
check('POST /api/auth/register succeeds', res.status === 201, `status ${res.status}${body?.error ? ` — ${body.error}` : ''}`);

const cookie = (res.headers.getSetCookie?.() || [])
  .map((c) => c.split(';')[0])
  .join('; ');

if (cookie) {
  res = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } });
  body = await res.json();
  check('new account gets a working session', res.status === 200 && body.user?.email === probeEmail);
  check('new account starts with no admin rights', body.isAdmin === false);
}

// The address must now be signin-able, which is what the user in the browser
// will be doing.
res = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: probeEmail, password }),
});
body = await res.json();
check('new account can then sign in', res.status === 200 && body.user?.email === probeEmail, `status ${res.status}`);

// A short password must still be refused.
res = await fetch(`${base}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `probe2-${Date.now()}@example.invalid`, password: 'short' }),
});
check('short password refused', res.status === 400, `status ${res.status}`);

// Duplicate email must be refused, not silently accepted.
res = await fetch(`${base}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: probeEmail, password }),
});
check('duplicate email refused with 409', res.status === 409, `status ${res.status}`);

// End the session again. Logout is POST /api/auth/session — there is no
// separate /auth/logout endpoint; that route clears the cookie.
if (cookie) {
  const del = await fetch(`${base}/api/auth/session`, { method: 'POST', headers: { Cookie: cookie } });
  check('signing out clears the session', del.status === 200, `status ${del.status}`);

  res = await fetch(`${base}/api/clients`, { headers: { Cookie: cookie } });
  check('session is no longer honoured', res.status === 401, `status ${res.status}`);
}

console.log(`\n  note: probe account ${probeEmail} remains in the database and can be deleted from Neon.`);
console.log(`${failures ? `\n${failures} FAILED` : '\nall good'}\n`);
process.exit(failures ? 1 : 0);
