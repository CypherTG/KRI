/**
 * Checks the deployed JavaScript bundle for product copy that should never ship.
 *
 * The user-visible strings live inside the bundle, so grepping the source alone
 * proves nothing about what a browser receives. This fetches the built entry
 * chunk and asserts the banned phrases are absent.
 */
const base = (process.argv[2] || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');

const BANNED = [
  'SharePoint',
  'Sharepoint',
  'KRI_Clients',
  'KRI_Users',
  'KRI_AcumenFiles',
  'KRI_Engagements',
  'document library',
  'reseed',
  'seed from SharePoint',
  'KRI Platform',
];

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log(`\n=== shipped copy: ${base} ===\n`);

const home = await fetch(`${base}/`);
const html = await home.text();
const entry = (html.match(/src="(\/assets\/index-[^"]+\.js)"/) || [])[1];
check('entry chunk found in the deployed HTML', Boolean(entry), entry);

if (entry) {
  const res = await fetch(base + entry);
  const js = await res.text();
  console.log(`  bundle: ${(js.length / 1024).toFixed(0)} KB\n`);

  for (const phrase of BANNED) {
    const count = (js.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    check(`bundle contains no "${phrase}"`, count === 0, count ? `${count} occurrence(s)` : '');
  }

  // The copy that should have replaced it.
  check('bundle ships the new product overview',
    js.includes('relationship intelligence platform'), 'platform overview rewritten');
  check('bundle ships the KAIROS guide label', js.includes('KAIROS Guide'), 'help centre header');
}

console.log(`\n${failures ? `${failures} FAILED` : 'no legacy copy shipped'}\n`);
process.exit(failures ? 1 : 0);
