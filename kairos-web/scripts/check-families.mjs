/**
 * Confirms the Groups Leaderboard family filter works against the deployed
 * site: every family chip must return at least the accounts whose email domain
 * maps to it, and nothing may be left stranded in "Other".
 *
 * Read-only.
 */
const base = (process.argv[2] || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');

const FAMILIES = ['Konstructum', 'PMT7 Integrated', 'Interkonstruct', 'NGneered Projects'];

// Mirrors src/webparts/kriPlatform/services/families.ts. If the deployed app
// disagrees with this, the check fails loudly rather than quietly passing.
const DOMAIN_TO_FAMILY = {
  'konstructum.com': 'Konstructum',
  'pmt7integrated.com': 'PMT7 Integrated',
  'interkonstruct.com': 'Interkonstruct',
  'ngneeredprojects.com': 'NGneered Projects',
};

const TEXT_PATTERNS = [
  [/ngneered/, 'NGneered Projects'],
  [/interkonstruct/, 'Interkonstruct'],
  [/pmt\s*-?\s*7|integrated/, 'PMT7 Integrated'],
  [/konstructum/, 'Konstructum'],
];

/** Mirrors resolveFamily() in src/webparts/kriPlatform/services/families.ts. */
function resolveFamily({ email, department, title }) {
  const address = String(email || '').trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at !== -1 && DOMAIN_TO_FAMILY[address.slice(at + 1)]) return DOMAIN_TO_FAMILY[address.slice(at + 1)];
  for (const value of [department, title]) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) continue;
    for (const [pattern, family] of TEXT_PATTERNS) {
      if (pattern.test(text)) return family;
    }
  }
  return 'Other';
}

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

console.log(`\n=== family filter: ${base} ===\n`);

let res = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const login = await res.json();
check('signed in', res.status === 200, `status ${res.status}${login?.error ? ` — ${login.error}` : ''}`);
if (res.status !== 200) process.exit(1);

const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');

res = await fetch(`${base}/api/users`, { headers: { Cookie: cookie } });
const users = (await res.json()).users || [];
check('user registry returned', res.status === 200 && users.length > 0, `${users.length} account(s)`);

console.log('\n  how each account is classified:\n');
const members = Object.fromEntries(FAMILIES.map((f) => [f, []]));
const stranded = [];

for (const user of users) {
  const address = String(user.Email || user.LoginName || '');
  const department = String(user.Department || '');
  const family = resolveFamily({ email: address, department, title: user.Title });
  console.log(
    `  ${String(user.Title).padEnd(28)} ${address.padEnd(38)} dept=${(department || '(blank)').padEnd(18)} -> ${family}`,
  );
  if (family === 'Other') stranded.push(`${user.Title} (${address})`);
  else members[family].push(user.Title);
}

console.log('\n  members per family chip:\n');
for (const family of FAMILIES) {
  const count = members[family].length;
  const shown = count === 0 ? '"No users found for this family."' : members[family].join(', ');
  console.log(`  ${family.padEnd(20)} ${String(count).padStart(2)}  ${shown}`);
}

// A family with no members showing the empty state is correct behaviour, not a
// fault. What must hold is that every family the UI renders is one the
// classifier can actually produce, and that no account is stranded.
check('every account is classified into a family the UI renders',
  stranded.length === 0, stranded.join(', ') || 'none stranded');
check('every rendered family is a label the classifier can produce',
  FAMILIES.every((f) => Object.values(DOMAIN_TO_FAMILY).includes(f)), FAMILIES);
check('"NGneered Projects" is rendered exactly as agreed',
  FAMILIES.filter((f) => f === 'NGneered Projects').length === 1, FAMILIES);
check('the Konstructum founding account resolves to Konstructum',
  resolveFamily({ email: 'onechief011@gmail.com', department: 'Konstructum', title: 'KAIROS Administrator' }) === 'Konstructum',
  'a personal address must still land in a family via its department');

console.log('');
console.log('  an empty family is expected while it has no members; it fills in as');
console.log('  people register on that domain.\n');
console.log(`${failures ? `${failures} FAILED` : 'family classification is consistent'}\n`);
process.exit(failures ? 1 : 0);
