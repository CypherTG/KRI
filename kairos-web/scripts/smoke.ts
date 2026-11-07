/**
 * End-to-end API smoke test.
 *
 * Invokes the real Vercel handlers against a real Postgres, with no mocking
 * beyond the req/res objects. Verifies the behaviours that matter for this
 * port: authentication, ownership scoping, the access-request workflow, the
 * stage audit trail, and the shape of every response the UI depends on.
 *
 *   npx tsx scripts/smoke.ts
 *
 * Point DATABASE_URL at a THROWAWAY database: the suite truncates it.
 */

import fs from 'node:fs';

process.env.SESSION_SECRET ||= 'test-secret-value-that-is-definitely-long-enough-1234567890';
process.env.GEMINI_API_KEY ||= '';
// Verification codes are read from the captured console send, not a mailbox.
process.env.ALLOW_CONSOLE_MAIL = 'true';
process.env.MAIL_APP_NAME = 'KAIROS';

import registerHandler from '../api/_routes/auth/register';
import loginHandler from '../api/_routes/auth/login';
import sessionHandler from '../api/_routes/auth/session';
import { verifyHandler } from '../api/_routes/auth/verification';
import { issueVerificationToken } from '../api/_lib/verification';
import clientsHandler from '../api/_routes/clients';
import clientHandler from '../api/_routes/client';
import communicationsHandler from '../api/_routes/communications';
import engagementsHandler from '../api/_routes/engagements';
import automationsHandler from '../api/_routes/automations';
import stageHistoryHandler from '../api/_routes/stage-history';
import usersHandler from '../api/_routes/users';
import biodataHandler from '../api/_routes/biodata';
import profilePhotoHandler from '../api/_routes/profile-photo';
import accessRequestsHandler from '../api/_routes/access-requests';
import companiesHandler from '../api/_routes/companies';
import lookupsHandler from '../api/_routes/lookups';
import importHandler from '../api/_routes/import';

type Handler = (req: any, res: any) => unknown;

class FakeResponse {
  statusCode = 200;
  payload: any = null;
  headers: Record<string, string> = {};

  status(code: number) {
    this.statusCode = code;
    return this;
  }
  setHeader(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
    return this;
  }
  json(payload: any) {
    this.payload = payload;
    return this;
  }
  get writableEnded() {
    return true;
  }
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 500)}`);
  }
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function call(handler: Handler, options: {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  cookie?: string;
  url?: string;
} = {}) {
  const req: any = {
    method: options.method || 'GET',
    headers: options.cookie ? { cookie: options.cookie } : {},
    query: options.query || {},
    body: options.body,
    // The deployed entry point is a catch-all that dispatches on req.url, so
    // the URL has to be present for the tests to exercise the real router
    // rather than each handler in isolation.
    url: options.url || handlerUrl.get(handler) || '/',
  };
  const res = new FakeResponse();
  await handler(req, res);
  const setCookie = res.headers['set-cookie'];
  const cookie = setCookie ? String(setCookie).split(';')[0] : undefined;
  return { status: res.statusCode, body: res.payload, cookie };
}

/** Maps each handler to its public path so `call` can build a realistic req.url. */
const handlerUrl = new Map<Handler, string>();

/**
 * Creates an account and verifies it, the way a person would.
 *
 * The code is taken from `issueVerificationToken` rather than scraped out of the
 * mailer's log output: the returned value is the raw token, so the test is
 * deterministic and does not depend on console formatting or on which stream the
 * transport happens to write to.
 */
async function registerAndVerify(input: {
  email: string;
  password: string;
  displayName?: string;
  jobTitle?: string;
}) {
  const registered = await call(registerHandler, { method: 'POST', body: input });
  if (registered.status !== 201) return { registered: false, verified: false, status: registered.status };

  const issue = await issueVerificationToken(input.email);
  if (!issue.ok || !issue.token) return { registered: true, verified: false, status: 'no code issued' };

  const verified = await call(verifyHandler, {
    method: 'POST',
    body: { email: input.email, token: issue.token },
  });
  return { registered: true, verified: verified.status === 200, status: verified.status };
}

/**
 * Loads .env.local for the optional service tokens.
 *
 * DATABASE_URL is deliberately NEVER read from here. `vercel blob connect` and
 * friends rewrite .env.local with the production connection string, so trusting
 * it would silently point the suite at the live database and let it create and
 * delete real records. The database must always be named explicitly in the
 * environment, which also makes it obvious that it is about to be truncated.
 */
function loadEnvFile() {
  const FORBIDDEN = new Set(['DATABASE_URL', 'POSTGRES_URL']);
  for (const file of ['.env.local', '.env']) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (FORBIDDEN.has(key)) continue;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('\n  DATABASE_URL is not set.\n');
    console.error('  The suite TRUNCATES the database it is given, so it must be pointed at a');
    console.error('  throwaway database. It is never read from .env.local on purpose, because');
    console.error('  `vercel blob connect` rewrites that file with the production URL.\n');
    console.error('    docker run -d --name kairos-test-db -p 55555:5432 \\');
    console.error('      -e POSTGRES_PASSWORD=kairos -e POSTGRES_DB=kairos postgres:16\n');
    console.error('    set "DATABASE_URL=postgres://postgres:kairos@127.0.0.1:55555/kairos"\n');
    process.exit(1);
  }
  if (/neon\.tech|neon\.build|vercel\.app|rds\.amazonaws\.com/i.test(process.env.DATABASE_URL)) {
    console.error('\n  Refusing to run: that looks like a hosted production database.');
    console.error('  The suite truncates its target and must only ever be given a throwaway.\n');
    process.exit(1);
  }

  loadEnvFile();
  const stamp = Date.now();

  section('Router');
  // Exercise the single deployed function the way Vercel invokes it.
  const catchAll = (await import('../api/handler')).default as Handler;
  const { listRoutes } = await import('../api/_routes');

  for (const route of listRoutes()) {
    handlerUrl.set(route.handler, `/api${route.path}`);
  }
  check('the catch-all exposes every endpoint', listRoutes().length === 23, listRoutes().length);

  const unknown = await call(catchAll, { method: 'GET', url: '/api/does-not-exist' });
  check('an unknown path returns 404 rather than crashing',
    unknown.status === 404 && /No API route matches/.test(unknown.body?.error || ''), unknown.body);

  const trailing = await call(catchAll, { method: 'GET', url: '/api/auth/session/' });
  check('a trailing slash still resolves', trailing.status === 200, trailing.body);

  const withQuery = await call(catchAll, { method: 'GET', url: '/api/auth/session?foo=bar' });
  check('a query string does not break routing', withQuery.status === 200, withQuery.body);

  const badMethod = await call(catchAll, { method: 'DELETE', url: '/api/auth/session' });
  check('an unsupported verb is rejected by the handler (405)', badMethod.status === 405, badMethod.body);

  // ─── founding administrator is pinned by email address ─────────────────────
  const adminEmail = 'onechief011@gmail.com';
  const otherEmail = `other${stamp}@pmt7integrated.com`;

  section('Authentication');
  const noSession = await call(sessionHandler, {});
  check('GET /auth/session with no cookie returns a null user', noSession.body?.user === null, noSession.body);

  // Registration no longer issues a session — the account is inert until the
  // emailed code is redeemed — so accounts used later in the suite are created
  // and then verified through the real flow. scripts/verification-test.ts covers
  // the verification rules themselves.
  const admin = await registerAndVerify({
    email: adminEmail,
    password: 'correct-horse-battery',
    displayName: 'Ada Admin',
    jobTitle: 'CEO',
  });
  check('the founding administrator can register and verify', admin.registered && admin.verified, admin);

  const adminLogin = await call(loginHandler, {
    method: 'POST',
    body: { email: adminEmail, password: 'correct-horse-battery' },
  });
  check('the verified administrator can sign in', adminLogin.status === 200, adminLogin.body);
  const adminCookie = adminLogin.cookie!;

  check('the pinned address is granted admin', adminLogin.body?.isAdmin === true, adminLogin.body?.isAdmin);
  check('the session payload uses the camelCase shape the browser hydrates',
    adminLogin.body?.user?.email === adminEmail && typeof adminLogin.body?.user?.id === 'string'
      && typeof adminLogin.body?.user?.displayName === 'string', adminLogin.body?.user);
  check('a verified session reports the address as verified',
    adminLogin.body?.user?.isEmailVerified === true, adminLogin.body?.user);

  const duplicate = await call(registerHandler, {
    method: 'POST',
    body: { email: adminEmail, password: 'another-password' },
  });
  check('registering a duplicate email is rejected with 409', duplicate.status === 409, duplicate.body);

  const weak = await call(registerHandler, {
    method: 'POST',
    body: { email: `w${stamp}@konstructum.com`, password: 'short' },
  });
  check('a password under 8 characters is rejected', weak.status === 400, weak.body);

  section('Families');
  // The Groups Leaderboard filter used to derive a person's family from the
  // `department` column, which nothing in the UI ever set, so every family chip
  // returned "No users found". It now derives from the email domain. These
  // checks pin that behaviour down.

  const {
    FAMILIES, FAMILY_ALL, FAMILY_OTHER, familyFromEmail, familyFromText,
    resolveFamily, everyApprovedDomainHasAFamily,
  } = await import('../src/webparts/kriPlatform/services/families');

  check('the four group companies are all present as families',
    ['Konstructum', 'PMT7 Integrated', 'Interkonstruct', 'NGneered Projects']
      .every((name) => FAMILIES.includes(name as any)), FAMILIES);
  check('"NGneered Projects" is spelled exactly as agreed',
    FAMILIES.includes('NGneered Projects' as any)
      && !FAMILIES.some((name) => /ngneered\s*project/i.test(name) && name !== 'NGneered Projects'),
    FAMILIES);

  check('every approved email domain maps to a family',
    everyApprovedDomainHasAFamily().length === 0, everyApprovedDomainHasAFamily());

  const domainCases: Array<[string, string | null]> = [
    ['someone@konstructum.com', 'Konstructum'],
    ['someone@pmt7integrated.com', 'PMT7 Integrated'],
    ['someone@interkonstruct.com', 'Interkonstruct'],
    ['someone@ngneeredprojects.com', 'NGneered Projects'],
    ['Someone@PMT7Integrated.com', 'PMT7 Integrated'],
    ['someone@sub.ngneeredprojects.com', null],
    ['someone@gmail.com', null],
    ['not-an-email', null],
  ];
  for (const [email, expected] of domainCases) {
    check(`familyFromEmail(${email}) is ${expected}`, familyFromEmail(email) === expected, familyFromEmail(email));
  }

  check('a department typed as free text still resolves',
    familyFromText('NGneered Projects Ltd') === 'NGneered Projects'
    && familyFromText('Interkonstruct') === 'Interkonstruct'
    && familyFromText('PMT 7') === 'PMT7 Integrated',
    'legacy department values must keep working');

  // The regression that motivated all of this: a real account whose department
  // is blank must still land in the right family.
  check('an account with a blank department is still classified by domain',
    resolveFamily({ email: 'someone@pmt7integrated.com', department: '', title: 'System Engineer' }) === 'PMT7 Integrated',
    resolveFamily({ email: 'someone@pmt7integrated.com', department: '', title: 'System Engineer' }));
  check('the domain wins over a contradictory department',
    resolveFamily({ email: 'someone@interkonstruct.com', department: 'Konstructum' }) === 'Interkonstruct',
    resolveFamily({ email: 'someone@interkonstruct.com', department: 'Konstructum' }));
  check('an unrecognised address falls back to Other',
    resolveFamily({ email: 'founder@gmail.com', department: '', title: 'KAIROS Administrator' }) === FAMILY_OTHER,
    resolveFamily({ email: 'founder@gmail.com', department: '', title: 'KAIROS Administrator' }));
  check('the all-families bucket is not itself a family',
    FAMILY_ALL !== FAMILY_OTHER && !FAMILIES.includes(FAMILY_ALL as any), { FAMILY_ALL, FAMILY_OTHER });

  // Business arms are a per-contact attribute with their own lists, one in the
  // contact form and one on the server that canonicalises spreadsheet values.
  // They are separate from `families` above but cover the same four companies,
  // so all three are checked for the same omission.
  const readArray = (file: string, name: string): string[] => {
    const source = fs.readFileSync(file, 'utf8');
    const match = source.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
    if (!match) return [];
    return (match[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  };

  const COMPANY_ARMS = ['INTERKONSTRUCT', 'KCC', 'PMT7', 'NGneered Projects'];
  const clientArms = readArray('src/webparts/kriPlatform/components/clients/ClientForm.tsx', 'BUSINESS_ARM_OPTIONS');
  const dashboardArms = readArray('src/webparts/kriPlatform/components/dashboard/TeamDashboard.tsx', 'BUSINESS_ARMS');
  const serverArms = readArray('api/_routes/import.ts', 'ARMS');

  check('the contact form offers an arm for every group company',
    COMPANY_ARMS.every((arm) => clientArms.includes(arm)), clientArms);
  check('the dashboard business-arm filter offers every group company',
    COMPANY_ARMS.every((arm) => dashboardArms.includes(arm)), dashboardArms);
  check('the import normaliser knows every group company',
    COMPANY_ARMS.every((arm) => serverArms.includes(arm)), serverArms);
  check('"NGneered Projects" is spelled identically in all three',
    [clientArms, dashboardArms, serverArms].every((list) => list.includes('NGneered Projects')),
    { clientArms, dashboardArms, serverArms });

  section('Email domain policy');
  // KAIROS is a company intranet, so only the four approved domains may hold an
  // account. The founding administrator is the single exception, which is why
  // the account above is on gmail.com and still registers.

  // The list is stated twice — the server cannot import the browser copy
  // because api/ is deployed file-by-file — so assert the two agree. Without
  // this, editing one and not the other would let the form reject an address
  // the server accepts, or worse, the reverse.
  const { ALLOWED_EMAIL_DOMAINS: serverDomains } = await import('../api/_lib/auth');
  const { ALLOWED_EMAIL_DOMAINS: clientDomains } = await import(
    '../src/webparts/kriPlatform/services/allowedDomains'
  );
  check('the server and browser domain lists are identical',
    JSON.stringify(serverDomains) === JSON.stringify(clientDomains),
    { server: serverDomains, client: clientDomains });

  for (const domain of ['konstructum.com', 'pmt7integrated.com', 'interkonstruct.com', 'ngneeredprojects.com']) {
    const allowed = await call(registerHandler, {
      method: 'POST',
      body: { email: `probe${stamp}@${domain}`, password: 'a-good-password' },
    });
    check(`an address at @${domain} may register`, allowed.status === 201, allowed.body);
  }

  for (const email of [
    `someone${stamp}@gmail.com`,
    `someone${stamp}@yahoo.com`,
    `someone${stamp}@konstructum.co`,       // near miss: a different TLD
    `someone${stamp}@notkonstructum.com`,  // near miss: suffix without the boundary
    `someone${stamp}@mail.konstructum.com`,
    `someone${stamp}@konstructum.com.evil.test`,
  ]) {
    const rejected = await call(registerHandler, {
      method: 'POST',
      body: { email, password: 'a-good-password' },
    });
    check(`registration is refused for ${email.split('@')[1]}`, rejected.status === 403, rejected.body);
  }

  check('the refusal explains which domains are permitted',
    /konstructum\.com/.test(String((await call(registerHandler, {
      method: 'POST',
      body: { email: `nope${stamp}@gmail.com`, password: 'a-good-password' },
    })).body?.error || '')), 'message should name the permitted domains');

  const exemptRegister = await call(registerHandler, {
    method: 'POST',
    body: { email: `pinned${stamp}@gmail.com`, password: 'a-good-password' },
  });
  check('a personal address is still refused even when it looks like the admin',
    exemptRegister.status === 403, exemptRegister.body);

  const strayLogin = await call(loginHandler, {
    method: 'POST',
    body: { email: `someone${stamp}@gmail.com`, password: 'a-good-password' },
  });
  check('sign-in is refused for a non-company address (403)', strayLogin.status === 403, strayLogin.body);

  const strayLoginWrongPassword = await call(loginHandler, {
    method: 'POST',
    body: { email: `someone${stamp}@gmail.com`, password: 'wrong-password' },
  });
  check('a non-company address is refused identically whatever the password',
    strayLoginWrongPassword.status === strayLogin.status && strayLoginWrongPassword.body?.error === strayLogin.body?.error,
    'a differing response would confirm whether an account exists');

  const exemptAdminLogin = await call(loginHandler, {
    method: 'POST',
    body: { email: adminEmail, password: 'correct-horse-battery' },
  });
  check('the founding administrator may still sign in from gmail.com',
    exemptAdminLogin.status === 200, exemptAdminLogin.body);

  // An admin minting an account directly is the other way in, so the rule has
  // to hold there as well — otherwise the boundary only covers self-registration.
  const adminMintsAllowed = await call(usersHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: { email: `minted${stamp}@interkonstruct.com`, displayName: 'Minted Person' },
  });
  check('an admin may create an account on a permitted domain', adminMintsAllowed.status === 201, adminMintsAllowed.body);

  const adminMintsStray = await call(usersHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: { email: `minted${stamp}@gmail.com`, displayName: 'Stray Person' },
  });
  check('an admin cannot create an account on a non-permitted domain (403)',
    adminMintsStray.status === 403, adminMintsStray.body);

  const strays = await (await import('../api/_lib/db')).raw<any>(
    'SELECT count(*)::int AS total FROM users WHERE email LIKE $1', [`%@gmail.com`]);
  check('the only gmail.com account is the pinned administrator',
    strays[0]?.total === 1, `found ${strays[0]?.total}`);

  // ALLOWED_EMAIL_DOMAINS may widen the list but must never narrow it, or a
  // misconfigured environment could quietly unlock every domain.
  const previousExtra = process.env.ALLOWED_EMAIL_DOMAINS;
  process.env.ALLOWED_EMAIL_DOMAINS = 'gmail.com, yahoo.com';
  const widened = await call(registerHandler, {
    method: 'POST',
    body: { email: `widened${stamp}@gmail.com`, password: 'a-good-password' },
  });
  check('an extra domain in ALLOWED_EMAIL_DOMAINS is accepted', widened.status === 201, widened.body);

  const stillEnforced = await call(registerHandler, {
    method: 'POST',
    body: { email: `still${stamp}@protonmail.com`, password: 'a-good-password' },
  });
  check('the hardcoded domains are still enforced when the env var is set',
    stillEnforced.status === 403, stillEnforced.body);
  if (previousExtra === undefined) delete process.env.ALLOWED_EMAIL_DOMAINS;
  else process.env.ALLOWED_EMAIL_DOMAINS = previousExtra;

  const badLogin = await call(loginHandler, {
    method: 'POST',
    body: { email: adminEmail, password: 'wrong-password' },
  });
  check('a wrong password is rejected with 401', badLogin.status === 401, badLogin.body);

  const goodLogin = await call(loginHandler, {
    method: 'POST',
    body: { email: adminEmail, password: 'correct-horse-battery' },
  });
  check('a correct password returns a session cookie', goodLogin.status === 200 && Boolean(goodLogin.cookie), goodLogin.body);

  const resolved = await call(sessionHandler, { cookie: adminCookie });
  check('GET /auth/session resolves the signed-in user', resolved.body?.user?.email === adminEmail, resolved.body);

  const otherRegistered = await registerAndVerify({
    email: otherEmail,
    password: 'another-good-password',
    displayName: 'Omar Other',
    jobTitle: 'Analyst',
  });
  check('a second account can register and verify', otherRegistered.registered && otherRegistered.verified, otherRegistered);

  const otherLogin = await call(loginHandler, {
    method: 'POST',
    body: { email: otherEmail, password: 'another-good-password' },
  });
  const otherCookie = otherLogin.cookie!;
  check('the second account can sign in', otherLogin.status === 200, otherLogin.status);
  check('the second account is not an administrator', otherLogin.body?.isAdmin !== true, otherLogin.body?.isAdmin);

  section('Contacts');
  const created = await call(clientsHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: {
      firstName: 'Amara',
      lastName: 'Okafor',
      email: 'amara@example.com',
      phone: '+234 801 000 0000',
      companyName: 'Zenith Construction',
      jobTitle: 'Managing Director',
      projectName: 'Project 1500',
      BusinessArm: ['KCC', 'PMT7'],
      kriStage: 'Knowledge',
      gender: 'Female',
    },
  });
  check('POST /clients creates a contact', created.status === 201, created.body);
  const clientId = created.body?.client?.ID;
  check('the created contact has an id', Boolean(clientId), created.body);
  check('Title is derived from first + last name', created.body?.client?.Title === 'Amara Okafor', created.body?.client?.Title);
  check('BusinessArm round-trips as an array', Array.isArray(created.body?.client?.BusinessArm)
    && created.body.client.BusinessArm.includes('KCC'), created.body?.client?.BusinessArm);
  check('companyName is stored', created.body?.client?.CompanyName === 'Zenith Construction', created.body?.client?.CompanyName);
  check('the creator is recorded as Author (person object)', Boolean(created.body?.client?.Author?.Title), created.body?.client?.Author);
  check('the owner is recorded as KCCContactPersonId', Boolean(created.body?.client?.KCCContactPersonId), created.body?.client);

  const list = await call(clientsHandler, { cookie: adminCookie });
  check('GET /clients lists the contact', list.body?.clients?.some((c: any) => c.ID === clientId), list.body?.clients?.length);

  section('A partial update must not blank untouched fields');
  const partial = await call(clientHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: clientId },
    body: { jobTitle: 'Group Managing Director' },
  });
  check('the patched field is applied', partial.body?.client?.JobTitle === 'Group Managing Director', partial.body?.client?.JobTitle);
  check('the company is NOT blanked by an unrelated edit',
    partial.body?.client?.CompanyName === 'Zenith Construction', partial.body?.client?.CompanyName);
  check('the email is NOT blanked by an unrelated edit',
    partial.body?.client?.Email === 'amara@example.com', partial.body?.client?.Email);
  check('the phone is NOT blanked by an unrelated edit',
    partial.body?.client?.Phone === '+234 801 000 0000', partial.body?.client?.Phone);
  check('business arms are NOT blanked by an unrelated edit',
    (partial.body?.client?.BusinessArm ?? []).includes('PMT7'), partial.body?.client?.BusinessArm);
  check('the project is NOT blanked by an unrelated edit',
    partial.body?.client?.ProjectName === 'Project 1500', partial.body?.client?.ProjectName);

  const cleared = await call(clientHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: clientId },
    body: { notes: '' },
  });
  check('an explicitly empty value DOES clear the field', cleared.body?.client?.Notes === '', cleared.body?.client?.Notes);
  check('clearing one field still leaves the others intact',
    cleared.body?.client?.CompanyName === 'Zenith Construction', cleared.body?.client?.CompanyName);

  section('Ownership scoping (enforce mode)');
  const otherList = await call(clientsHandler, { cookie: otherCookie });
  const otherSees = otherList.body?.clients?.some((c: any) => c.ID === clientId);
  check('a non-owner cannot see the contact in the list', otherSees === false, otherList.body?.clients);

  const otherDirect = await call(clientHandler, { cookie: otherCookie, query: { id: clientId } });
  check('a non-owner cannot fetch the contact directly (404)', otherDirect.status === 404, otherDirect.body);

  const otherEdit = await call(clientHandler, {
    method: 'PATCH',
    cookie: otherCookie,
    query: { id: clientId },
    body: { notes: 'should not apply' },
  });
  check('a non-owner cannot edit the contact (403)', otherEdit.status === 403, otherEdit.body);

  section('Access-request workflow');
  const requested = await call(accessRequestsHandler, {
    method: 'POST',
    cookie: otherCookie,
    body: { clientId, reason: 'I own this account.' },
  });
  check('a non-owner can request access', requested.status === 201, requested.body);
  const requestId = requested.body?.request?.ID;
  check('the new request starts as Pending', requested.body?.request?.Status === 'Pending', requested.body?.request?.Status);

  const stillHidden = await call(clientHandler, { cookie: otherCookie, query: { id: clientId } });
  check('a Pending request does not grant access', stillHidden.status === 404, stillHidden.body);

  const selfRespond = await call(accessRequestsHandler, {
    method: 'POST',
    cookie: otherCookie,
    query: { respond: '1' },
    body: { id: requestId, status: 'Approved' },
  });
  check('a requester cannot approve their own request (403)', selfRespond.status === 403, selfRespond.body);

  const approved = await call(accessRequestsHandler, {
    method: 'POST',
    cookie: adminCookie,
    query: { respond: '1' },
    body: { id: requestId, status: 'Approved' },
  });
  check('the owner can approve the request', approved.status === 200, approved.body);
  check('the request becomes Approved', approved.body?.request?.Status === 'Approved', approved.body?.request?.Status);

  const nowVisible = await call(clientHandler, { cookie: otherCookie, query: { id: clientId } });
  check('an Approved request grants read access', nowVisible.status === 200, nowVisible.body);

  const sharedEdit = await call(clientHandler, {
    method: 'PATCH',
    cookie: otherCookie,
    query: { id: clientId },
    body: { notes: 'try to write' },
  });
  check('shared access is read-only (403 on write)', sharedEdit.status === 403, sharedEdit.body);

  section('Stage progression + audit trail');
  const beforeHistory = await call(stageHistoryHandler, { cookie: adminCookie, query: { clientId } });
  const historyBefore = beforeHistory.body?.stageHistory?.length ?? 0;

  const moved = await call(clientHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: clientId },
    body: { kriStage: 'Rapport', stageNotes: 'Had a good call.' },
  });
  check('the stage can be advanced', moved.body?.client?.KRIStage === 'Rapport', moved.body?.client?.KRIStage);

  const afterHistory = await call(stageHistoryHandler, { cookie: adminCookie, query: { clientId } });
  check('a stage-history row is written automatically',
    (afterHistory.body?.stageHistory?.length ?? 0) === historyBefore + 1, afterHistory.body?.stageHistory?.length);
  const latest = afterHistory.body?.stageHistory?.[0];
  check('the audit row records previous → new stage',
    latest?.PreviousStage === 'Knowledge' && latest?.NewStage === 'Rapport', latest);
  check('the audit row records who changed it', Boolean(latest?.ChangedBy), latest?.ChangedBy);

  const badStage = await call(clientHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: clientId },
    body: { kriStage: 'Nonsense' },
  });
  check('an invalid stage is rejected (400)', badStage.status === 400, badStage.body);

  section('Communications');
  const comm = await call(communicationsHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: {
      clientId,
      subject: 'Introductory call',
      type: 'Call',
      notes: 'Discussed the tender timeline.',
      followUpRequired: true,
      nextFollowUp: '2026-11-04',
    },
  });
  check('POST /communications logs an interaction', comm.status === 201, comm.body);
  check('NextFollowUpDate mirrors FollowUpDate', Boolean(comm.body?.comm?.NextFollowUpDate), comm.body?.comm);
  check('FollowUpRequired round-trips as a boolean', comm.body?.comm?.FollowUpRequired === true, comm.body?.comm);

  const comms = await call(communicationsHandler, { cookie: adminCookie, query: { clientId } });
  check('GET /communications returns it', comms.body?.comms?.some((c: any) => c.ID === comm.body.comm.ID), comms.body?.comms?.length);

  const commOther = await call(communicationsHandler, { cookie: otherCookie, query: { clientId } });
  check('comms are scoped to the visible contact',
    (commOther.body?.comms ?? []).every((c: any) => c.ClientID === clientId), commOther.body?.comms);

  section('Engagements');
  const eng = await call(engagementsHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: { clientId, title: 'Structural survey', stage: 'Draft', estimatedValue: 2500000, notes: 'Phase one' },
  });
  check('POST /engagements creates a deal', eng.status === 201, eng.body);
  const engagementId = eng.body?.engagement?.ID;
  check('EstimatedValue round-trips as a number', eng.body?.engagement?.EstimatedValue === 2500000, eng.body?.engagement?.EstimatedValue);
  check('ClientName is resolved for display', eng.body?.engagement?.ClientName === 'Amara Okafor', eng.body?.engagement?.ClientName);

  const won = await call(engagementsHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: engagementId },
    body: { stage: 'Won' },
  });
  check('a deal can be marked Won', won.body?.engagement?.Status === 'Won', won.body?.engagement?.Status);
  check('winning stamps a closed date', Boolean(won.body?.engagement?.ClosedDate), won.body?.engagement?.ClosedDate);

  const engOther = await call(engagementsHandler, { cookie: otherCookie, query: { clientId } });
  check('a shared contact exposes its deals', (engOther.body?.engagements?.length ?? 0) >= 1, engOther.body?.engagements?.length);

  const engEdit = await call(engagementsHandler, {
    method: 'PATCH',
    cookie: otherCookie,
    query: { id: engagementId },
    body: { title: 'hijacked' },
  });
  check('a non-owner cannot edit the deal (403)', engEdit.status === 403, engEdit.body);

  section('Automations');
  const auto = await call(automationsHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: { clientId, title: 'Birthday greeting', automationType: 'Birthday Message', isEnabled: true, messageTemplate: 'Happy birthday!' },
  });
  check('POST /automations creates a rule', auto.status === 201, auto.body);
  const autoId = auto.body?.automation?.ID;
  const toggled = await call(automationsHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: autoId },
    body: { isEnabled: false },
  });
  check('a rule can be toggled off', toggled.body?.automation?.IsEnabled === false, toggled.body?.automation);

  const badType = await call(automationsHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: { clientId, automationType: 'Telepathy' },
  });
  check('an unknown automation type is rejected (400)', badType.status === 400, badType.body);

  section('Biodata');
  const bio = await call(biodataHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: {
      contact_id: clientId,
      full_name: 'Amara Chidinma Okafor',
      gender: 'Female',
      current_company: 'Zenith Construction',
      job_title: 'Managing Director',
      date_of_birth: '1984-03-11',
      nationality: 'Nigeria',
      languages_spoken: ['English', 'Igbo'],
      education: ['BSc Civil Engineering, UNN 2006'],
      motivators: ['Legacy', 'Social impact'],
      consent_email: true,
    },
  });
  check('POST /biodata upserts the extended profile', bio.status === 200, bio.body);
  check('text[] fields round-trip as arrays', Array.isArray(bio.body?.biodata?.languages_spoken)
    && bio.body.biodata.languages_spoken.includes('Igbo'), bio.body?.biodata?.languages_spoken);
  check('date_of_birth is normalised to YYYY-MM-DD', bio.body?.biodata?.date_of_birth === '1984-03-11', bio.body?.biodata?.date_of_birth);
  check('consent booleans survive', bio.body?.biodata?.consent_email === true, bio.body?.biodata?.consent_email);

  const readBio = await call(biodataHandler, { cookie: adminCookie, query: { contactId: clientId } });
  check('GET /biodata reads it back', readBio.body?.biodata?.full_name === 'Amara Chidinma Okafor', readBio.body?.biodata?.full_name);

  const mirrored = await call(clientHandler, { cookie: adminCookie, query: { id: clientId } });
  check('biodata mirrors the full name back onto the contact',
    mirrored.body?.client?.Title === 'Amara Chidinma Okafor', mirrored.body?.client?.Title);

  section('Lookups + companies');
  const seeded = await call(lookupsHandler, { method: 'POST', cookie: adminCookie, body: { list: 'job_titles', values: ['Managing Director'] } });
  check('job titles can be seeded', seeded.status === 200, seeded.body);
  const lookups = await call(lookupsHandler, { cookie: adminCookie });
  check('lookups return the seeded job title', lookups.body?.jobTitles?.includes('Managing Director'), lookups.body);

  const companies = await call(companiesHandler, { cookie: adminCookie });
  check('the company registry picked up the contact company',
    companies.body?.companies?.some((c: any) => c.CompanyName === 'Zenith Construction'), companies.body?.companies);
  const counted = companies.body?.companies?.find((c: any) => c.CompanyName === 'Zenith Construction');
  check('contact_count is maintained', counted?.ContactCount === 1, counted);

  section('Users + admin management');
  const users = await call(usersHandler, { cookie: adminCookie });
  check('GET /users lists the registry', (users.body?.users?.length ?? 0) >= 2, users.body?.users?.length);
  check('the registry reports whether the caller can manage',
    users.body?.canManage === true, users.body?.canManage);

  const otherUsers = await call(usersHandler, { cookie: otherCookie });
  check('a non-admin is told they cannot manage', otherUsers.body?.canManage === false, otherUsers.body?.canManage);

  const selfPromote = await call(usersHandler, {
    method: 'PATCH',
    cookie: otherCookie,
    query: { id: otherUsers.body?.users?.[0]?.ID },
    body: { isAdmin: true },
  });
  check('a non-admin cannot promote themselves (403)', selfPromote.status === 403, selfPromote.body);

  // The sign-in response uses the camelCase session shape (lowercase `id`);
  // /api/users returns the PascalCase IKRIUser shape the UI consumes.
  const otherUserId = otherLogin.body?.user?.id;
  check('the sign-in response exposes the account id', Boolean(otherUserId), otherLogin.body?.user);
  // Matched by email rather than by position: the registry holds several people
  // and its ordering is not something the test should depend on.
  const otherRegistryEntry = (otherUsers.body?.users || []).find(
    (user: any) => String(user.Email || '').toLowerCase() === otherEmail.toLowerCase(),
  );
  check('the session id matches the people registry entry',
    otherRegistryEntry?.ID === otherUserId,
    { session: otherUserId, registry: otherRegistryEntry?.ID });

  const promote = await call(usersHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: otherUserId },
    body: { isAdmin: true },
  });
  check('an admin can promote another user', promote.body?.user?.IsAdmin === true, promote.body?.user);

  const demoted = await call(usersHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: otherUserId },
    body: { isAdmin: false },
  });
  check('an admin can revoke admin again', demoted.body?.user?.IsAdmin === false, demoted.body?.user);

  const selfDeactivate = await call(usersHandler, {
    method: 'PATCH',
    cookie: otherCookie,
    query: { id: otherUserId },
    body: { isActive: false },
  });
  check('nobody can edit their own account through this route (403)', selfDeactivate.status === 403, selfDeactivate.body);

  section('Excel import');
  const csv = [
    'First Name,Last Name,Email,Phone,Company Name,Job Title,KRI Stage',
    `Import,One,import1+${stamp}@example.com,+2348020000000,Delta Ltd,Engineer,Knowledge`,
    `Import,Two,import2+${stamp}@example.com,+2348020000001,Delta Ltd,Engineer,Rapport`,
    `Import,Two,import2+${stamp}@example.com,+2348020000001,Delta Ltd,Engineer,Rapport`,
  ].join('\n');
  const base64 = Buffer.from(csv, 'utf8').toString('base64');
  const imported = await call(importHandler, { method: 'POST', cookie: adminCookie, body: { base64, fileName: 'registry.csv' } });
  check('CSV import succeeds', imported.status === 200, imported.body);
  check('import creates new rows', imported.body?.created === 2, imported.body);
  check('import upserts the duplicate rather than duplicating it', imported.body?.updated === 1, imported.body);

  const afterImport = await call(clientsHandler, { cookie: adminCookie });
  const deltaContacts = afterImport.body?.clients?.filter((c: any) => c.CompanyName === 'Delta Ltd') ?? [];
  check('Delta Ltd ends up with exactly 2 contacts', deltaContacts.length === 2, deltaContacts.length);
  check('a company is auto-registered from the import', Boolean(
    (await call(companiesHandler, { cookie: adminCookie })).body?.companies?.some((c: any) => c.CompanyName === 'Delta Ltd'),
  ));

  section('Ownership assignment (admin only)');
  const assign = await call(clientHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: clientId },
    body: { kccContactPerson: { Id: otherUserId } },
  });
  check('an admin can reassign a contact owner', assign.status === 200, assign.body);
  check('the new owner is recorded', assign.body?.client?.KCCContactPersonId === otherUserId, assign.body?.client?.KCCContactPersonId);

  const nowOwnerSees = await call(clientsHandler, { cookie: otherCookie });
  check('the new owner now sees the contact without an access request',
    nowOwnerSees.body?.clients?.some((c: any) => c.ID === clientId), nowOwnerSees.body?.clients?.length);

  const nonAdminAssign = await call(clientHandler, {
    method: 'PATCH',
    cookie: otherCookie,
    query: { id: clientId },
    body: { kccContactPerson: { Id: adminCookie ? 'someone-else' : '' } },
  });
  check('a non-admin cannot reassign ownership (400/403)',
    nonAdminAssign.status === 400 || nonAdminAssign.status === 403, nonAdminAssign.body);

  section('Needs & Opportunity is admin-only');
  const nonAdminNeeds = await call(clientHandler, {
    method: 'PATCH',
    cookie: otherCookie,
    query: { id: clientId },
    body: { needsOpportunity: 'try to set this' },
  });
  check('a non-admin cannot set Needs & Opportunity (403)', nonAdminNeeds.status === 403, nonAdminNeeds.body);

  const adminNeeds = await call(clientHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: clientId },
    body: { needsOpportunity: 'Q4 infrastructure renewal' },
  });
  check('an admin can set Needs & Opportunity', adminNeeds.status === 200, adminNeeds.body);

  section('Profile photo');
  // SharePoint served each user's picture from Entra ID, so there was no upload
  // path. Now the user supplies it, and the endpoint is deliberately
  // self-service: it only ever writes to the caller's own row.

  const anonymousPhoto = await call(profilePhotoHandler, { method: 'POST', body: { base64: 'aGk=', contentType: 'image/png' } });
  check('uploading a photo requires a session', anonymousPhoto.status === 401, anonymousPhoto.body);

  const notAnImage = await call(profilePhotoHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: { base64: Buffer.from('not an image').toString('base64'), contentType: 'text/html' },
  });
  check('a non-image content type is refused', notAnImage.status === 400, notAnImage.body);

  // SVG is excluded on purpose: it can carry script, and Blob serves it from a
  // public origin, so an uploaded SVG would be a stored-XSS vector.
  const svgUpload = await call(profilePhotoHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: { base64: Buffer.from('<svg onload="alert(1)"/>').toString('base64'), contentType: 'image/svg+xml' },
  });
  check('an SVG is refused even though it is an image/* type', svgUpload.status === 400, svgUpload.body);

  const emptyUpload = await call(profilePhotoHandler, {
    method: 'POST',
    cookie: adminCookie,
    body: { base64: '', contentType: 'image/png' },
  });
  check('an empty upload is refused', emptyUpload.status === 400, emptyUpload.body);

  const { blobEnabled } = await import('../api/_lib/blob');
  if (!blobEnabled()) {
    // Without a storage token the endpoint correctly refuses; there is nothing
    // further worth asserting about the upload itself.
    const unconfigured = await call(profilePhotoHandler, {
      method: 'POST',
      cookie: adminCookie,
      body: { base64: Buffer.from('fake').toString('base64'), contentType: 'image/png' },
    });
    check('with no storage configured the upload is refused', unconfigured.status === 500, unconfigured.body);
  } else {
    // A 1x1 transparent PNG.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const uploaded = await call(profilePhotoHandler, {
      method: 'POST',
      cookie: adminCookie,
      body: { base64: png, contentType: 'image/png', fileName: 'me.png' },
    });
    check('a user can upload their own photo', uploaded.status === 200, uploaded.body);
    check('the upload returns a public URL', /^https?:\/\//.test(String(uploaded.body?.profilePhoto || '')), uploaded.body?.profilePhoto);
    check('the response maps the user with the new photo',
      uploaded.body?.user?.ProfilePhoto === uploaded.body?.profilePhoto, uploaded.body?.user);

    const sessionAfter = await call(sessionHandler, { cookie: adminCookie });
    check('the session carries the new photo, so the header avatar updates',
      sessionAfter.body?.user?.profilePhoto === uploaded.body?.profilePhoto, sessionAfter.body?.user?.profilePhoto);

    const replaced = await call(profilePhotoHandler, {
      method: 'POST',
      cookie: adminCookie,
      body: { base64: png, contentType: 'image/png', fileName: 'me2.png' },
    });
    check('uploading again replaces the photo with a new URL',
      replaced.status === 200 && replaced.body?.profilePhoto !== uploaded.body?.profilePhoto,
      { before: uploaded.body?.profilePhoto, after: replaced.body?.profilePhoto });

    // The second user's photo must be untouched by the first user's upload.
    const otherSession = await call(sessionHandler, { cookie: otherCookie });
    check("one user's upload does not change another user's photo",
      !String(otherSession.body?.user?.profilePhoto || '').includes('users/'), otherSession.body?.user?.profilePhoto);

    const removed = await call(profilePhotoHandler, { method: 'DELETE', cookie: adminCookie });
    check('a user can remove their own photo', removed.status === 200, removed.body);

    const afterRemoval = await call(sessionHandler, { cookie: adminCookie });
    check('the session no longer carries a photo after removal',
      !afterRemoval.body?.user?.profilePhoto, afterRemoval.body?.user?.profilePhoto);
  }

  section('Session teardown');
  const loggedOut = await call(sessionHandler, { method: 'POST', cookie: adminCookie });
  check('POST /auth/session clears the session', loggedOut.status === 200, loggedOut.body);

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('='.repeat(52));
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(1);
});
