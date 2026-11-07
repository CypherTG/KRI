/**
 * Smoke-checks a deployed KAIROS instance over plain HTTP.
 *
 *   node scripts/check-deployment.mjs https://konstructum-kairos.vercel.app
 */
const base = (process.argv[2] || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');

let failed = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    failed += 1;
    if (detail !== undefined) console.log(`        ${String(detail).slice(0, 300)}`);
  }
}

async function main() {
  console.log(`\n=== ${base} ===\n`);
  console.log('Static app');
  console.log('----------');

  const root = await fetch(`${base}/`);
  const html = await root.text();
  check('GET / returns 200', root.status === 200, root.status);
  check('serves HTML', /text\/html/.test(root.headers.get('content-type') || ''), root.headers.get('content-type'));
  check('page title is KAIROS', (html.match(/<title>([^<]*)<\/title>/) || [])[1] === 'KAIROS', (html.match(/<title>([^<]*)<\/title>/) || [])[1]);
  check('mount point present', html.includes('id="root"'));
  check('no server-rendered secret leakage', !html.includes('GEMINI_API_KEY') && !html.includes('DATABASE_URL'));

  const entry = (html.match(/src="\/assets\/([^"]+\.js)"/) || [])[1];
  check('entry bundle referenced', Boolean(entry), entry);
  if (entry) {
    const asset = await fetch(`${base}/assets/${entry}`);
    const bytes = (await asset.arrayBuffer()).byteLength;
    check('entry bundle serves', asset.status === 200, asset.status);
    check('entry bundle is a sane size', bytes > 5000 && bytes < 1_500_000, `${Math.round(bytes / 1024)}KB`);
  }

  const deep = await fetch(`${base}/dashboard`);
  const deepHtml = await deep.text();
  check('deep link /dashboard serves the app shell (SPA rewrite works)',
    deep.status === 200 && deepHtml.includes('id="root"'), deep.status);

  const missingAsset = await fetch(`${base}/assets/definitely-not-here.js`);
  check('a missing asset 404s rather than returning HTML',
    missingAsset.status === 404, missingAsset.status);

  console.log('\nAPI');
  console.log('---');

  const session = await fetch(`${base}/api/auth/session`);
  const sessionBody = await session.text();
  check('GET /api/auth/session responds', session.status === 200, `${session.status} ${sessionBody.slice(0, 200)}`);
  check('reports no session for an anonymous visitor', sessionBody.includes('"user":null'), sessionBody.slice(0, 200));

  const unknown = await fetch(`${base}/api/definitely-not-a-route`);
  const unknownBody = await unknown.text();
  check('unknown API path returns a clean 404',
    unknown.status === 404 && unknownBody.includes('No API route matches'), `${unknown.status} ${unknownBody.slice(0, 160)}`);

  const unauthorised = await fetch(`${base}/api/clients`);
  const unauthorisedBody = await unauthorised.text();
  check('protected endpoint rejects anonymous access',
    unauthorised.status === 401 && /signed out/i.test(unauthorisedBody), `${unauthorised.status} ${unauthorisedBody.slice(0, 160)}`);

  const badVerb = await fetch(`${base}/api/auth/session`, { method: 'DELETE' });
  check('unsupported verb is rejected', badVerb.status === 405, badVerb.status);

  // A real sign-in only works once DATABASE_URL is configured.
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'onechief011@gmail.com', password: 'definitely-not-the-password' }),
  });
  const loginBody = await login.text();
  const dbConfigured = !/DATABASE_URL is not configured/.test(loginBody);
  console.log(`\n  ${dbConfigured ? 'PASS' : 'WARN'}  sign-in endpoint reached the database` +
    `${dbConfigured ? '' : ' — DATABASE_URL is not set yet'}`);

  if (dbConfigured) {
    check('a wrong password is rejected with 401', login.status === 401, `${login.status} ${loginBody.slice(0, 160)}`);
  }

  console.log(`\n${failed ? `${failed} FAILED` : 'deployment healthy'}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('\ncheck failed:', error.message);
  process.exit(1);
});
