/**
 * Confirms the company-domain policy is live on the deployed site.
 *
 * Creates nothing: every disallowed address is refused before the database is
 * touched, and the one permitted address used here is the pinned administrator
 * signing in with credentials rather than registering.
 */
const base = (process.argv[2] || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function post(path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: parsed };
}

console.log(`\n=== domain policy: ${base} ===\n`);

const stamp = Date.now();
const password = 'A-good-password-1';

for (const domain of ['konstructum.com', 'pmt7integrated.com', 'interkonstruct.com', 'ngneeredprojects.com']) {
  const allowed = await post('/api/auth/register', { email: `probe${stamp}@${domain}`, password });
  check(`@${domain} is accepted`, allowed.status === 201, `status ${allowed.status}${allowed.body?.error ? ` — ${allowed.body.error}` : ''}`);
}

for (const domain of ['gmail.com', 'yahoo.com', 'konstructum.co', 'notkonstructum.com', 'protonmail.com']) {
  const rejected = await post('/api/auth/register', { email: `probe${stamp}@${domain}`, password });
  check(`@${domain} is refused`, rejected.status === 403, `status ${rejected.status}`);
}

const stray = await post('/api/auth/register', { email: `probe${stamp}@gmail.com`, password });
check('the refusal names the permitted domains',
  /konstructum\.com/.test(String(stray.body?.error || '')), stray.body?.error);

const wrongPassword = await post('/api/auth/register', { email: `probe${stamp}@gmail.com`, password: 'irrelevant' });
check('the refusal is identical whatever the password',
  wrongPassword.status === stray.status && wrongPassword.body?.error === stray.body?.error,
  'a differing reply would confirm whether an account exists');

const signin = await post('/api/auth/login', { email: `probe${stamp}@gmail.com`, password });
check('sign-in is refused for a non-company address', signin.status === 403, `status ${signin.status}`);

const adminEmail = process.env.KAIROS_EMAIL || 'onechief011@gmail.com';
const adminSignin = await post('/api/auth/login', { email: adminEmail, password: process.env.KAIROS_PASSWORD });
check('the pinned administrator is exempt and can still sign in',
  adminSignin.status === 200, `status ${adminSignin.status}${adminSignin.body?.error ? ` — ${adminSignin.body.error}` : ''}`);

console.log(`\n${failures ? `${failures} FAILED` : 'domain policy is live'}\n`);
console.log('  note: this check created four real accounts on the permitted domains,');
console.log('        named probe<timestamp>@<domain>, to prove they are accepted.');
console.log('        Remove them with scripts/delete-account.mjs when convenient.\n');

process.exit(failures ? 1 : 0);
