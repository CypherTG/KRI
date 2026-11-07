/**
 * Verifies the seeded founding administrator can actually sign in and use
 * the app. Run after:  node scripts/apply-schema.mjs --seed
 *
 *   DATABASE_URL=… ADMIN_EMAIL=… ADMIN_PASSWORD=… npx tsx scripts/verify-seed.ts
 */
process.env.SESSION_SECRET ||= 'local-verification-secret-value-long-enough-1234567890';

import loginHandler from '../api/_routes/auth/login';
import sessionHandler from '../api/_routes/auth/session';
import clientsHandler from '../api/_routes/clients';
import usersHandler from '../api/_routes/users';
import airosHandler from '../api/_routes/airos';

class FakeResponse {
  statusCode = 200;
  payload: any = null;
  headers: Record<string, string> = {};
  status(code: number) { this.statusCode = code; return this; }
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; }
  json(payload: any) { this.payload = payload; return this; }
  get writableEnded() { return true; }
}

async function call(handler: any, options: any = {}) {
  const req: any = {
    method: options.method || 'GET',
    headers: options.cookie ? { cookie: options.cookie } : {},
    query: options.query || {},
    body: options.body,
  };
  const res = new FakeResponse();
  await handler(req, res);
  const setCookie = res.headers['set-cookie'];
  return { status: res.statusCode, body: res.payload, cookie: setCookie ? String(setCookie).split(';')[0] : undefined };
}

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    failed += 1;
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 400)}`);
  }
}

async function main() {
  const email = String(process.env.ADMIN_EMAIL || 'onechief011@gmail.com').trim();
  const password = String(process.env.ADMIN_PASSWORD ?? '').trim();
  if (!password) {
    console.error('Set ADMIN_PASSWORD to the password you seeded with.');
    process.exit(1);
  }

  console.log('\n=== Seeded founder sign-in ===');

  const login = await call(loginHandler, { method: 'POST', body: { email, password } });
  check('the seeded password signs in', login.status === 200 && Boolean(login.cookie), login.body);
  check('the account resolves as an administrator', login.body?.isAdmin === true, login.body?.isAdmin);

  const cookie = login.cookie!;
  const me = await call(sessionHandler, { cookie });
  check('the session persists', me.body?.user?.email === email, me.body?.user);

  const clients = await call(clientsHandler, { cookie });
  check('the contact list loads (empty is fine)', clients.status === 200 && Array.isArray(clients.body?.clients), clients.body);

  const users = await call(usersHandler, { cookie });
  check('the people registry loads', (users.body?.users?.length ?? 0) >= 1, users.body?.users?.length);
  check('admin capabilities are granted', users.body?.canManage === true, users.body?.canManage);

  // AIROS needs a real Gemini key, so only assert that the route refuses
  // cleanly rather than failing open.
  const noKey = await call(airosHandler, {
    method: 'POST',
    cookie,
    body: { prompt: 'How many contacts do I have?', routeLabel: 'Dashboard' },
  });
  check('AIROS refuses rather than leaking when unconfigured',
    noKey.status === 503, noKey.body?.error);

  const unauth = await call(airosHandler, { method: 'POST', body: { prompt: 'hi' } });
  check('AIROS requires a session', unauth.status === 401, unauth.body);

  console.log(`\n${failed ? `${failed} FAILED` : 'all good'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
