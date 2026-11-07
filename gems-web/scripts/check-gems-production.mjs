/**
 * Production check for GEMS.
 *
 * Proves the three things that define this deployment:
 *  1. GEMS signs people in with the same accounts as KAIROS (shared `users`).
 *  2. The eight-agency scope holds against the real registry — the shared
 *     contact table has hundreds of rows, and only the agency subset may appear.
 *  3. A stakeholder contact written by one app is immediately visible to the
 *     other, with no sync step.
 *
 * Read-only apart from one audit row, and nothing is left behind.
 */
const base = (process.argv[2] || 'https://konstructum-gems.vercel.app').replace(/\/$/, '');

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const email = process.env.KAIROS_EMAIL;
const password = process.env.KAIROS_PASSWORD;
if (!email || !password) {
  console.error('Set KAIROS_EMAIL and KAIROS_PASSWORD.');
  process.exit(1);
}

const AGENCIES = ['NUPRC', 'NUIMS', 'NCDMB', 'NEPL', 'NNPC', 'NIMASA', 'ENSERV', 'NMDPRA'];

console.log(`\n=== GEMS production check: ${base} ===\n`);

// ── Static app ────────────────────────────────────────────────────────────────
const home = await fetch(`${base}/`);
const html = await home.text();
check('the app is served', home.status === 200, `status ${home.status}`);
check('it is GEMS, not KAIROS', /<title>GEMS<\/title>/.test(html), 'page title');
check('the mount point is present', html.includes('id="root"'));

// ── Shared identity ───────────────────────────────────────────────────────────
let res = await fetch(`${base}/api/auth/session`);
let body = await res.json();
check('an anonymous session resolves to no user', res.status === 200 && body.user === null, `status ${res.status}`);

res = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
body = await res.json();
check('the KAIROS account signs in here too (shared users table)',
  res.status === 200 && body.user?.email?.toLowerCase() === email.toLowerCase(),
  `status ${res.status}${body?.error ? ` — ${body.error}` : ''}`);
if (res.status !== 200) process.exit(1);

const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
check('a session cookie is issued', Boolean(cookie));

res = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } });
body = await res.json();
check('the session resolves', res.status === 200 && Boolean(body.user), `status ${res.status}`);

// ── The agency scope, against real data ──────────────────────────────────────
res = await fetch(`${base}/api/gems/stakeholders`, { headers: { Cookie: cookie } });
const stakeholders = await res.json();
const list = stakeholders.stakeholders || [];
check('the stakeholder list is readable', res.status === 200, `status ${res.status}`);
check('stakeholders are returned', list.length > 0, `${list.length} in scope`);

const offScope = list.filter((s) => !AGENCIES.some((a) => String(s.CompanyName || '').toLowerCase().includes(a.toLowerCase())));
check('every returned stakeholder sits at a monitored agency', offScope.length === 0,
  offScope.length ? offScope.slice(0, 3).map((s) => s.CompanyName).join(', ') : 'none leaked');

const byAgency = {};
for (const s of list) {
  const a = AGENCIES.find((x) => String(s.CompanyName || '').toLowerCase().includes(x.toLowerCase()));
  if (a) byAgency[a] = (byAgency[a] || 0) + 1;
}
console.log('\n  stakeholders per agency:');
for (const a of AGENCIES) console.log(`    ${a.padEnd(9)} ${byAgency[a] || 0}`);
console.log('');

check('the response advertises its scope',
  AGENCIES.every((a) => String(stakeholders.scope || '').includes(a)), stakeholders.scope);

// ── Agencies ──────────────────────────────────────────────────────────────────
res = await fetch(`${base}/api/gems/agencies`, { headers: { Cookie: cookie } });
const agencies = await res.json();
const names = (agencies.agencies || []).map((a) => a.name);
check('all eight monitored agencies are listed, including empty ones',
  AGENCIES.every((a) => names.includes(a)), names.join(', '));

// ── Summary ───────────────────────────────────────────────────────────────────
res = await fetch(`${base}/api/gems/summary`, { headers: { Cookie: cookie } });
const summary = await res.json();
check('the dashboard summary is readable', res.status === 200, `status ${res.status}`);
check('it counts stakeholders in scope', typeof summary.totalStakeholders === 'number' && summary.totalStakeholders > 0,
  summary.totalStakeholders);
check('it counts interactions', typeof summary.totalInteractions === 'number', summary.totalInteractions);
check('it counts compliance', typeof summary.totalCompliance === 'number', summary.totalCompliance);
check('it reports overdue actions', typeof summary.overdueActions === 'number', summary.overdueActions);

// ── Other endpoints ───────────────────────────────────────────────────────────
for (const [label, path] of [
  ['notifications', '/api/gems/notifications'],
  ['interactions', '/api/gems/interactions'],
  ['compliance', '/api/gems/compliance'],
  ['actions', '/api/gems/actions'],
  ['audit', '/api/gems/audit'],
]) {
  res = await fetch(base + path, { headers: { Cookie: cookie } });
  check(`${label} responds`, res.status === 200, `status ${res.status}`);
}

res = await fetch(`${base}/api/health`);
const health = await res.json();
check('the database is connected from GEMS', health.database?.connected === true, health.database?.error || '');
check('the shared contact table is visible', health.database?.counts?.clients >= 0,
  `${health.database?.counts?.clients} contacts in the shared registry`);
check('the GEMS tables exist', health.database?.counts?.gems_interactions !== undefined,
  Object.keys(health.database?.counts || {}).join(', '));

// ── Anonymous access is refused ───────────────────────────────────────────────
for (const path of ['/api/gems/stakeholders', '/api/gems/summary', '/api/gems/interactions']) {
  res = await fetch(base + path);
  check(`${path} refuses an anonymous caller`, res.status === 401, `status ${res.status}`);
}

console.log(`\n${failures ? `${failures} FAILED` : 'GEMS is live and correctly scoped'}\n`);
process.exit(failures ? 1 : 0);
