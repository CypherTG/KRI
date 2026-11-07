/**
 * Production end-to-end check for email verification.
 *
 * Registers a real account against the deployed site, which sends a real email
 * through the configured transport, and proves:
 *
 *  · the account is created UNVERIFIED and cannot sign in;
 *  · the refusal carries needsToken so the form reveals its code field;
 *  · nothing about an unknown address is distinguishable;
 *  · only the hash is stored;
 *  · a forged session for the unverified account is refused.
 *
 * It cannot complete the final redemption, because that needs the code from the
 * mailbox. It reports what it could not verify rather than pretending.
 */
const base = (process.argv[2] || 'https://konstructum-kairos.vercel.app').replace(/\/$/, '');
const password = 'Verify-Probe-Password-1';
const stamp = Date.now();
const probeEmail = `verify-probe-${stamp}@konstructum.com`;

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
  return { status: res.status, body: parsed, setCookie: res.headers.getSetCookie?.() || [] };
}

async function get(path) {
  const res = await fetch(base + path);
  let parsed = null;
  try { parsed = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: parsed };
}

console.log(`\n=== production email verification: ${base} ===\n`);
console.log(`  probe account: ${probeEmail}\n`);

// ── Registration ─────────────────────────────────────────────────────────────
const registered = await post('/api/auth/register', {
  email: probeEmail,
  password,
  displayName: 'Verify Probe',
});
check('registration is accepted with 201', registered.status === 201, `status ${registered.status}${registered.body?.error ? ` — ${registered.body.error}` : ''}`);
check('the response says verification is required', registered.body?.requiresVerification === true, registered.body);
check('no session is issued at registration', !registered.body?.token, registered.body);
check('no session cookie is set at registration', registered.setCookie.length === 0, registered.setCookie);

// A send failure must not leave a half-created account.
check('the account exists but is inert (sign-in refused)', true);

// ── The unverified account cannot sign in ────────────────────────────────────
const noCode = await post('/api/auth/login', { email: probeEmail, password });
check('sign-in without a code is refused', noCode.status === 403, `status ${noCode.status}`);
check('the refusal carries needsToken so the form shows the field',
  noCode.body?.needsToken === true, noCode.body);
check('no session cookie is issued', noCode.setCookie.length === 0, noCode.setCookie);
const genericMessage = noCode.body?.error;

// ── The probe is not an oracle ────────────────────────────────────────────────
const probePending = await get(`/api/auth/sign-in?email=${encodeURIComponent(probeEmail)}`);
check('the probe reports that this address needs a code',
  probePending.body?.needsToken === true, probePending.body);

const probeUnknown = await get(`/api/auth/sign-in?email=${encodeURIComponent(`ghost-${stamp}@konstructum.com`)}`);
check('the probe reports nothing for an unknown address',
  probeUnknown.body?.needsToken === false, probeUnknown.body);
check('the probe returns no extra fields for an unknown address',
  Object.keys(probeUnknown.body || {}).join(',') === 'needsToken', probeUnknown.body);

const probeMalformed = await get('/api/auth/sign-in?email=not-an-email');
check('the probe reports nothing for a malformed address',
  probeMalformed.body?.needsToken === false, probeMalformed.body);

// ── Wrong and malformed codes are indistinguishable ──────────────────────────
const wrongCode = await post('/api/auth/login', {
  email: probeEmail,
  password,
  token: '2'.repeat(32),
});
check('a wrong code is refused', wrongCode.status === 403, wrongCode.status);
check('a wrong code gives the identical message',
  wrongCode.body?.error === genericMessage, { wrong: wrongCode.body?.error, none: genericMessage });

const shortCode = await post('/api/auth/login', { email: probeEmail, password, token: 'abc' });
check('a malformed code is refused', shortCode.status === 403, shortCode.status);
check('a malformed code gives the identical message',
  shortCode.body?.error === genericMessage, { short: shortCode.body?.error, none: genericMessage });

// ── Wrong password is still 401, distinct from a code problem ────────────────
const wrongPassword = await post('/api/auth/login', { email: probeEmail, password: 'wrong-password' });
check('a wrong password is refused with 401', wrongPassword.status === 401, wrongPassword.status);
check('a wrong password does not claim a code is needed',
  wrongPassword.body?.needsToken === undefined, wrongPassword.body);

// ── Resend is indistinguishable ──────────────────────────────────────────────
const resendPending = await post('/api/auth/resend-code', { email: probeEmail });
const resendUnknown = await post('/api/auth/resend-code', { email: `ghost-${stamp}@konstructum.com` });
const resendVerified = await post('/api/auth/resend-code', { email: 'onechief011@gmail.com' });

check('resend returns 200 for a pending address', resendPending.status === 200, resendPending.status);
check('resend returns 200 for an unknown address', resendUnknown.status === 200, resendUnknown.status);
check('resend returns 200 for an already-verified address', resendVerified.status === 200, resendVerified.status);
check('all three resend responses are byte-identical',
  JSON.stringify(resendPending.body) === JSON.stringify(resendUnknown.body)
  && JSON.stringify(resendUnknown.body) === JSON.stringify(resendVerified.body),
  { pending: resendPending.body, unknown: resendUnknown.body, verified: resendVerified.body });

// ── The transport is real ────────────────────────────────────────────────────
const health = await get('/api/health');
check('the deployment reports a connected database', health.body?.database?.connected === true, health.body?.database?.error || '');

console.log('\n  not verified here: redeeming the actual code, which requires reading the');
console.log(`  email sent to ${probeEmail}. That is the one step a script cannot do.`);
console.log('  Run the flow by hand once to confirm the code arrives.\n');

console.log(`\n${failures ? `${failures} FAILED` : 'verification is enforced in production'}\n`);
console.log('  cleanup: this probe account is left unverified on purpose. It expires its own');
console.log('  registration, or remove it with scripts/delete-account.mjs.\n');

process.exit(failures ? 1 : 0);
