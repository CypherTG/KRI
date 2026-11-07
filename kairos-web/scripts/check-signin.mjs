/**
 * Verifies credentials against the deployed sign-in endpoint and, when they
 * work, confirms the session is honoured on a protected endpoint.
 *
 * The password is read from KAIROS_PASSWORD and is never written to the URL,
 * the database or any file. Nothing is created or modified.
 */
const base = (process.argv[2] || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');
const email = process.env.KAIROS_EMAIL;
const password = process.env.KAIROS_PASSWORD;

if (!email || !password) {
  console.error('Set KAIROS_EMAIL and KAIROS_PASSWORD.');
  process.exit(1);
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log(`\n=== sign-in check: ${base} ===\n`);
console.log(`  account: ${email}\n`);

let res = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
let body = await res.json();
check('credentials accepted', res.status === 200, `status ${res.status}${body?.error ? ` — ${body.error}` : ''}`);

if (res.status !== 200) {
  console.log(`\n${failures} FAILED\n`);
  process.exit(1);
}

check('email case-insensitive match', body.user?.email?.toLowerCase() === email.toLowerCase());
console.log(`  display name : ${body.user?.displayName || '(none)'}`);
console.log(`  isAdmin      : ${body.isAdmin}`);

const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
check('session cookie issued', Boolean(cookie));

res = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } });
body = await res.json();
check('session resolves on a protected endpoint', res.status === 200 && body.user?.email?.toLowerCase() === email.toLowerCase());

// End the session again.
await fetch(`${base}/api/auth/session`, { method: 'POST', headers: { Cookie: cookie } });

console.log(`\n${failures ? `${failures} FAILED` : 'credentials work'}\n`);
process.exit(failures ? 1 : 0);
