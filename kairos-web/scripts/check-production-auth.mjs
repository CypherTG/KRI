/**
 * End-to-end check against the deployed site.
 *
 * Proves the whole production stack, not just that a function returns 200:
 * Neon accepts the connection, bcrypt verifies the seeded password, a signed
 * JWT is issued as an HttpOnly cookie, and that cookie then authorises a real
 * protected read plus an authenticated write.
 */
const base = (process.argv[2] || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');
const email = process.env.KAIROS_EMAIL || 'onechief011@gmail.com';
const password = process.env.KAIROS_PASSWORD;

if (!password) {
  console.error('Set KAIROS_PASSWORD to the seeded founder password.');
  process.exit(1);
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

console.log(`\n=== production end-to-end: ${base} ===\n`);

// Anonymous session
let res = await fetch(`${base}/api/auth/session`);
let body = await res.json();
check('anonymous session resolves', res.status === 200 && body.user === null);

// Sign in
res = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
storeCookies(res);
body = await res.json();
check('founder signs in', res.status === 200 && Boolean(body.user?.email), `status ${res.status}`);
check('founder is an administrator', body.user?.isAdmin === true);
check('session cookie issued', jar.has('kairos_session'), [...jar.keys()].join(', ') || 'none');

const setCookie = res.headers.getSetCookie?.() || [];
check('cookie is HttpOnly', setCookie.some((c) => /httponly/i.test(c)));
check('cookie is SameSite protected', setCookie.some((c) => /samesite/i.test(c)));

// Authenticated reads
res = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookieHeader() } });
body = await res.json();
check('session survives', res.status === 200 && body.user?.email === email);

for (const path of ['/api/clients', '/api/users', '/api/lookups', '/api/companies']) {
  res = await fetch(base + path, { headers: { Cookie: cookieHeader() } });
  check(`authenticated read ${path}`, res.status === 200, `status ${res.status}`);
}

// Authenticated write, then read it back and remove it.
res = await fetch(`${base}/api/clients`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() },
  body: JSON.stringify({ firstName: 'Deploy', lastName: 'Verification', kriStage: 'Knowledge' }),
});
body = await res.json();
check('authenticated create', res.status === 201, `status ${res.status}${body?.error ? ` — ${body.error}` : ''}`);
// The mappers intentionally emit SharePoint-style PascalCase keys so the React
// port consumes the same field names the original web part did.
const createdId = body?.client?.ID;

if (createdId) {
  res = await fetch(`${base}/api/client?id=${createdId}`, { headers: { Cookie: cookieHeader() } });
  body = await res.json();
  check('created record reads back', res.status === 200 && body?.client?.ID === createdId);

  res = await fetch(`${base}/api/client?id=${createdId}`, {
    method: 'DELETE',
    headers: { Cookie: cookieHeader() },
  });
  check('created record cleaned up', res.status === 200 || res.status === 204, `status ${res.status}`);
} else {
  check('created record reads back', false, 'no id returned by create');
}

// An anonymous request must still be refused.
res = await fetch(`${base}/api/clients`);
check('anonymous still refused', res.status === 401, `status ${res.status}`);

console.log(`\n${failures ? `${failures} FAILED` : 'all good'}\n`);
process.exit(failures ? 1 : 0);
