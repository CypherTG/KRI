/**
 * Verifies a non-administrator's view of the shared contact pool.
 *
 * This is the check that matters for the "my colleague logs in and sees
 * nothing" complaint: it signs in as a plain user, confirms they can see the
 * shared pool, and confirms they still cannot reach administrator-only actions.
 *
 * Read-only. Set the credentials of a NON-ADMIN account.
 */
const base = (process.argv[2] || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');

const email = process.env.KAIROS_EMAIL;
const password = process.env.KAIROS_PASSWORD;
if (!email || !password) {
  console.error('Set KAIROS_EMAIL and KAIROS_PASSWORD to a non-administrator account.');
  process.exit(1);
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log(`\n=== shared pool visibility: ${base} ===\n`);
console.log(`  account: ${email}\n`);

let res = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const login = await res.json();
check('signed in', res.status === 200, `status ${res.status}${login?.error ? ` — ${login.error}` : ''}`);
if (res.status !== 200) process.exit(1);

check('this account is NOT an administrator', login.isAdmin === false, `isAdmin=${login.isAdmin}`);

const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');

// The shared pool.
res = await fetch(`${base}/api/clients`, { headers: { Cookie: cookie } });
const list = await res.json();
const visible = (list.clients || []).length;
check('the contact list is readable', res.status === 200, `status ${res.status}`);
check('the shared pool is visible to a non-admin', visible > 0, `${visible} contact(s)`);

// A contact this user does not own must be openable directly, not 404.
const foreign = (list.clients || []).find((c) => c.KCCContactPersonId);
check('a contact owned by someone else is listed', Boolean(foreign),
  foreign ? `${foreign.Title} (owner ${foreign.KCCContactPerson?.Title || 'unknown'})` : 'none found');

if (foreign) {
  res = await fetch(`${base}/api/client?id=${foreign.ID}`, { headers: { Cookie: cookie } });
  check('a contact owned by someone else can be opened directly', res.status === 200, `status ${res.status}`);

  res = await fetch(`${base}/api/communications`, {
    headers: { Cookie: cookie },
  });
  const comms = await res.json();
  check('the activity feed is readable', res.status === 200, `${(comms.comms || []).length} entries`);

  res = await fetch(`${base}/api/engagements`, { headers: { Cookie: cookie } });
  check('the deals pipeline is readable', res.status === 200, `status ${res.status}`);

  res = await fetch(`${base}/api/companies`, { headers: { Cookie: cookie } });
  const companies = await res.json();
  check('the company registry is readable', res.status === 200, `${(companies.companies || []).length} companies`);
}

// Opening the shared pool must NOT hand out administrator rights.
res = await fetch(`${base}/api/users`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ email: `escalation-probe-${Date.now()}@konstructum.com`, displayName: 'Escalation Probe' }),
});
check('a non-admin still cannot create accounts (403)', res.status === 403, `status ${res.status}`);

res = await fetch(`${base}/api/users`, { headers: { Cookie: cookie } });
const registry = await res.json();
check('the people directory reports no management rights for a non-admin',
  registry.canManage === false, `canManage=${registry.canManage}`);

console.log(`\n${failures ? `${failures} FAILED` : 'the shared pool is visible to non-administrators'}\n`);
process.exit(failures ? 1 : 0);
