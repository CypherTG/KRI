/**
 * Email verification tests.
 *
 * Covers the twelve behaviours the feature is required to guarantee, including
 * the two that only fail under an attacker: a code being bound to one mailbox,
 * and no response that distinguishes "no such account" from "wrong code".
 *
 *   npx tsx scripts/verification-test.ts
 *
 * The suite TRUNCATES its target database, so DATABASE_URL must be a throwaway.
 * The console mail transport is used so the code can be read from the captured
 * send, never from a real mailbox.
 */

import fs from 'node:fs';

process.env.SESSION_SECRET ||= 'test-secret-value-that-is-definitely-long-enough-1234567890';
// Keep AI out of the way.
process.env.GEMINI_API_KEY ||= '';
// Codes are read from the captured send, not from a mailbox.
process.env.ALLOW_CONSOLE_MAIL = 'true';
process.env.MAIL_APP_NAME = 'KAIROS';

import registerHandler from '../api/_routes/auth/register.js';
import loginHandler from '../api/_routes/auth/login.js';
import sessionHandler from '../api/_routes/auth/session.js';
import resendCodeHandler, { signInProbeHandler, verifyHandler } from '../api/_routes/auth/verification.js';
import usersHandler from '../api/_routes/users.js';
import { raw, rawOne } from '../api/_lib/db.js';
import {
  ALPHABET,
  TOKEN_LENGTH,
  GENERIC_VERIFICATION_ERROR,
  hashVerificationToken,
  safeEqual,
  sweepExpiredRegistrations,
} from '../api/_lib/verification.js';

type Handler = (req: any, res: any) => unknown;

class FakeResponse {
  statusCode = 200;
  payload: any = null;
  headers: Record<string, string> = {};
  status(code: number) { this.statusCode = code; return this; }
  setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; return this; }
  json(payload: any) { this.payload = payload; return this; }
  get writableEnded() { return true; }
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
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 400)}`);
  }
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

const handlerUrl = new Map<Handler, string>([
  [registerHandler, '/api/auth/register'],
  [loginHandler, '/api/auth/login'],
  [sessionHandler, '/api/auth/session'],
  [resendCodeHandler, '/api/auth/resend-code'],
  [signInProbeHandler, '/api/auth/sign-in'],
  [verifyHandler, '/api/auth/verify'],
  [usersHandler, '/api/users'],
]);

async function call(target: Handler, options: {
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
    url: options.url || handlerUrl.get(target) || '/',
  };
  const res = new FakeResponse();
  await target(req, res);
  const setCookie = res.headers['set-cookie'];
  return {
    status: res.statusCode,
    body: res.payload,
    cookie: setCookie ? String(setCookie).split(';')[0] : undefined,
  };
}

/**
 * Captures the code the mailer would have sent.
 *
 * The console transport prints it; intercepting here keeps the test independent
 * of log formatting and of the real SMTP path.
 */
const sentCodes: Array<{ to: string; code: string }> = [];
let lastCode = (): string => {
  const last = sentCodes[sentCodes.length - 1];
  return last ? last.code : '';
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('\n  DATABASE_URL is not set.\n');
    process.exit(1);
  }
  if (/neon\.tech|neon\.build|vercel\.app/i.test(process.env.DATABASE_URL)) {
    console.error('\n  Refusing to run against what looks like production.\n');
    process.exit(1);
  }

  const stamp = Date.now();
  const emailA = `verify-a-${stamp}@konstructum.com`;
  const emailB = `verify-b-${stamp}@konstructum.com`;
  const password = 'correct-horse-battery';

  // Intercept the console transport's output.
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const text = args.map(String).join(' ');
    const codeMatch = text.match(/\n\s{4}([A-Z0-9]{32})\n/);
    const toMatch = text.match(/verification code for (\S+)/);
    if (codeMatch && toMatch) sentCodes.push({ to: toMatch[1], code: codeMatch[1] });
    originalWarn(...args);
  };

  // ── Token primitives ───────────────────────────────────────────────────────
  section('Token primitives');

  check('the alphabet is exactly the agreed set',
    ALPHABET === '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', ALPHABET);
  // The excluded glyphs are O, 0, I, 1 and lowercase l. L is deliberately kept:
  // it is a distinct shape from 1 in most UI fonts, and dropping it would shorten
  // the alphabet.
  check('the alphabet excludes O, 0, I and 1', !/[O0I1]/.test(ALPHABET), ALPHABET);
  check('the alphabet excludes lowercase l', !ALPHABET.includes('l'), ALPHABET);
  check('the alphabet has 32 distinct characters', new Set(ALPHABET).size === 32, new Set(ALPHABET).size);
  check('the alphabet is uppercase digits and letters only', /^[A-Z0-9]+$/.test(ALPHABET), ALPHABET);
  check('a token is 32 characters', TOKEN_LENGTH === 32, TOKEN_LENGTH);
  const { generateVerificationToken } = await import('../api/_lib/verification.js');
  const sample = generateVerificationToken();
  check('a generated token has the right length', sample.length === TOKEN_LENGTH, sample.length);
  check('a generated token uses only alphabet characters', [...sample].every((c) => ALPHABET.includes(c)), sample);
  check('two generated tokens differ', generateVerificationToken() !== generateVerificationToken());

  const hash = hashVerificationToken(sample);
  check('hashing is deterministic', hash === hashVerificationToken(sample));
  check('the hash is 64 hex characters', /^[0-9a-f]{64}$/.test(hash), hash);
  check('the hash is not the token', hash !== sample);
  check('safeEqual matches identical values', safeEqual('abc', 'abc'));
  check('safeEqual rejects different values', !safeEqual('abc', 'abd'));
  check('safeEqual rejects a length mismatch', !safeEqual('abc', 'abcd'));
  check('safeEqual rejects an empty value', !safeEqual('', 'abc'));

  // ── Registration creates an inert account ───────────────────────────────────
  section('Registration creates an unverified, inert account');

  const registered = await call(registerHandler, {
    method: 'POST',
    body: { email: emailA, password, displayName: 'Verify A' },
  });
  check('sign-up returns 201', registered.status === 201, registered.body);
  check('the response says verification is required', registered.body?.requiresVerification === true, registered.body);
  check('no session token is issued at sign-up', !registered.body?.token, registered.body);
  check('no session cookie is set at sign-up', !registered.body?.cookie && !registered.cookie, registered.cookie);

  const rowA = await rawOne<any>('SELECT * FROM users WHERE lower(email) = $1', [emailA]);
  check('the account exists', Boolean(rowA?.id), rowA);
  check('it is unverified', rowA?.email_verified_at === null, rowA?.email_verified_at);
  check('a verification hash is stored', typeof rowA?.verification_token_hash === 'string', rowA?.verification_token_hash);
  check('the send counter was incremented', rowA?.verification_sent_count === 1, rowA?.verification_sent_count);

  const sent = sentCodes[sentCodes.length - 1];
  check('a code was emailed to the address', sent?.to === emailA, sent?.to);
  check('the code is 32 characters', sent?.code?.length === TOKEN_LENGTH, sent?.code?.length);
  check('the code contains none of O/0/I/1/l', sent?.code && !/[O0I1l]/.test(sent.code), sent?.code);

  // ── Only the hash is stored ─────────────────────────────────────────────────
  section('Only the hash is persisted');

  const everyHash = await raw<any>('SELECT email, verification_token_hash FROM users');
  const rawTokenAppears = everyHash.some(
    (row) => typeof row.verification_token_hash === 'string' && sentCodes.some(
      (s) => s.code && row.verification_token_hash.includes(s.code),
    ),
  );
  check('the raw code appears in no stored hash', !rawTokenAppears);
  check('the stored value is the SHA-256 of the code',
    rowA?.verification_token_hash === hashVerificationToken(sent.code));

  const dumped = JSON.stringify(everyHash);
  check('the raw code is not present anywhere in the user table',
    !sentCodes.some((s) => s.code && dumped.includes(s.code)));

  // ── An unverified account cannot sign in ────────────────────────────────────
  section('An unverified account cannot sign in');

  const noCode = await call(loginHandler, {
    method: 'POST',
    body: { email: emailA, password },
  });
  check('sign-in without a code is refused', noCode.status === 403, noCode.status);
  check('the response carries needsToken so the client can show the field',
    noCode.body?.needsToken === true, noCode.body);
  check('the refusal uses the generic message',
    noCode.body?.error === GENERIC_VERIFICATION_ERROR, noCode.body?.error);
  check('no session cookie is issued', !noCode.cookie, noCode.cookie);

  const wrongCode = await call(loginHandler, {
    method: 'POST',
    body: { email: emailA, password, token: '2'.repeat(TOKEN_LENGTH) },
  });
  check('a wrong code is refused', wrongCode.status === 403, wrongCode.status);
  check('a wrong code gives the identical message',
    wrongCode.body?.error === noCode.body?.error, { wrong: wrongCode.body?.error, none: noCode.body?.error });

  const stillUnverified = await rawOne<any>('SELECT email_verified_at FROM users WHERE lower(email) = $1', [emailA]);
  check('a failed attempt does not verify the account', stillUnverified?.email_verified_at === null);

  // ── Malformed codes are indistinguishable ───────────────────────────────────
  section('Malformed codes are indistinguishable from wrong ones');

  const malformed: string[] = ['', 'short', 'x'.repeat(31), 'x'.repeat(33), '!'.repeat(32), 'O0I1'.repeat(8)];
  const malformedBodies: string[] = [];
  for (const token of malformed) {
    const attempt = await call(loginHandler, {
      method: 'POST',
      body: { email: emailA, password, token },
    });
    check(`a ${token.length}-character code is refused (${token.length})`, attempt.status === 403, attempt.status);
    malformedBodies.push(attempt.body?.error);
  }
  check('every malformed code returns the same message',
    malformedBodies.every((message) => message === GENERIC_VERIFICATION_ERROR), malformedBodies);

  // ── The correct code signs in and verifies ──────────────────────────────────
  section('The correct code signs in and verifies');

  const goodCode = await call(loginHandler, {
    method: 'POST',
    body: { email: emailA, password, token: sent.code },
  });
  check('the correct code is accepted', goodCode.status === 200, goodCode.body);
  check('a session cookie is issued', Boolean(goodCode.cookie), goodCode.cookie);
  check('the session reports the address as verified',
    goodCode.body?.user?.isEmailVerified === true, goodCode.body?.user);

  const verifiedRow = await rawOne<any>(
    'SELECT email_verified_at, verification_token_hash, verification_token_expires_at FROM users WHERE lower(email) = $1',
    [emailA],
  );
  check('email_verified_at is set', verifiedRow?.email_verified_at !== null, verifiedRow?.email_verified_at);
  check('the stored hash is cleared', verifiedRow?.verification_token_hash === null, verifiedRow?.verification_token_hash);
  check('the expiry is cleared', verifiedRow?.verification_token_expires_at === null, verifiedRow?.verification_token_expires_at);

  const session = await call(sessionHandler, { cookie: goodCode.cookie });
  check('the session resolves the verified user',
    session.body?.user?.email?.toLowerCase() === emailA, session.body?.user);

  // ── Single use ──────────────────────────────────────────────────────────────
  section('A consumed code cannot be replayed');

  const replay = await call(loginHandler, {
    method: 'POST',
    body: { email: emailA, password, token: sent.code },
  });
  // The replayed code is simply ignored: there is no hash left to match, so the
  // account signs in on the password alone because it is already verified. What
  // matters is that the code verified nothing a second time.
  check('replaying the code does not re-verify anything',
    replay.status === 200 && replay.body?.user?.isEmailVerified === true, replay.body?.user);
  const afterReplay = await rawOne<any>(
    'SELECT verification_token_hash, verification_token_expires_at FROM users WHERE lower(email) = $1',
    [emailA],
  );
  check('the hash stays cleared after a replay', afterReplay?.verification_token_hash === null,
    afterReplay?.verification_token_hash);
  check('the expiry stays cleared after a replay', afterReplay?.verification_token_expires_at === null,
    afterReplay?.verification_token_expires_at);

  const replayDirect = await call(verifyHandler, {
    method: 'POST',
    body: { email: emailA, token: sent.code },
  });
  check('the verify endpoint refuses a spent code', replayDirect.status === 403, replayDirect.body);

  const sentCountAfterReplay = await rawOne<any>(
    'SELECT verification_sent_count FROM users WHERE lower(email) = $1', [emailA],
  );
  check('a replay does not issue a new code',
    Number(sentCountAfterReplay?.verification_sent_count) === 1, sentCountAfterReplay?.verification_sent_count);

  // ── A verified account needs no code ────────────────────────────────────────
  section('A verified account signs in with the password alone');

  const passwordOnly = await call(loginHandler, {
    method: 'POST',
    body: { email: emailA, password },
  });
  check('a verified account signs in without a code', passwordOnly.status === 200, passwordOnly.status);

  const probeVerified = await call(signInProbeHandler, { query: { email: emailA } });
  check('the probe says a verified address needs no code', probeVerified.body?.needsToken === false, probeVerified.body);

  const wrongPassword = await call(loginHandler, {
    method: 'POST',
    body: { email: emailA, password: 'wrong-password' },
  });
  check('a wrong password is refused', wrongPassword.status === 401, wrongPassword.status);
  check('a wrong password says nothing about codes',
    wrongPassword.body?.needsToken === undefined, wrongPassword.body);

  // ── The email-binding test ─────────────────────────────────────────────────
  section("Account A's code cannot sign in account B");

  const registeredB = await call(registerHandler, {
    method: 'POST',
    body: { email: emailB, password, displayName: 'Verify B' },
  });
  check('a second account registers', registeredB.status === 201, registeredB.body);
  const codeB = lastCode();
  check('a separate code was issued for B', codeB && codeB !== sent.code);

  const crossUse = await call(loginHandler, {
    method: 'POST',
    body: { email: emailB, password, token: sent.code },
  });
  check("A's code does NOT sign in B", crossUse.status !== 200, crossUse.status);
  check("A's code against B gives the generic message",
    crossUse.body?.error === GENERIC_VERIFICATION_ERROR, crossUse.body?.error);

  const bRow = await rawOne<any>('SELECT email_verified_at FROM users WHERE lower(email) = $1', [emailB]);
  check('B remains unverified after the cross-attempt', bRow?.email_verified_at === null, bRow?.email_verified_at);

  const ownCode = await call(loginHandler, {
    method: 'POST',
    body: { email: emailB, password, token: codeB },
  });
  check("B signs in with B's own code", ownCode.status === 200, ownCode.status);

  // ── The probe reveals nothing useful ────────────────────────────────────────
  section('The probe is not an enumeration oracle');

  const probeUnknown = await call(signInProbeHandler, { query: { email: `nobody-${stamp}@konstructum.com` } });
  check('an unknown address reports needsToken false', probeUnknown.body?.needsToken === false, probeUnknown.body);
  check('an unknown address gives no extra fields',
    Object.keys(probeUnknown.body || {}).join(',') === 'needsToken', probeUnknown.body);

  const registeredC = `verify-c-${stamp}@konstructum.com`;
  await call(registerHandler, { method: 'POST', body: { email: registeredC, password, displayName: 'Verify C' } });
  const probePending = await call(signInProbeHandler, { query: { email: registeredC } });
  check('a pending address reports needsToken true', probePending.body?.needsToken === true, probePending.body);

  const probeMalformed = await call(signInProbeHandler, { query: { email: 'not-an-email' } });
  check('a malformed address reports needsToken false', probeMalformed.body?.needsToken === false, probeMalformed.body);

  // ── Resend ──────────────────────────────────────────────────────────────────
  section('Resending a code');

  const resend = await call(resendCodeHandler, { method: 'POST', body: { email: registeredC } });
  check('resend returns 200', resend.status === 200, resend.status);
  const resentCode = lastCode();
  check('a new code was sent', resentCode && resentCode !== codeB, { resentCode, codeB });

  const oldCodeNoLongerWorks = await call(loginHandler, {
    method: 'POST',
    body: { email: registeredC, password, token: lastCodeBefore(sentCodes, resentCode) },
  });
  check('superseded codes stop working', oldCodeNoLongerWorks.status === 403, oldCodeNoLongerWorks.status);

  const withResent = await call(loginHandler, {
    method: 'POST',
    body: { email: registeredC, password, token: resentCode },
  });
  check('the newest code signs in', withResent.status === 200, withResent.status);

  // Resend must be indistinguishable across every outcome.
  const resendVerified = await call(resendCodeHandler, { method: 'POST', body: { email: emailA } });
  const resendUnknown = await call(resendCodeHandler, { method: 'POST', body: { email: `ghost-${stamp}@konstructum.com` } });
  const exhausted = `verify-d-${stamp}@konstructum.com`;
  await call(registerHandler, { method: 'POST', body: { email: exhausted, password } });
  for (let i = 0; i < 6; i += 1) {
    await call(resendCodeHandler, { method: 'POST', body: { email: exhausted } });
  }
  const resendExhausted = await call(resendCodeHandler, { method: 'POST', body: { email: exhausted } });

  const shapes = [resendVerified, resendUnknown, resendExhausted].map((r) => JSON.stringify(r.body));
  check('resend returns an identical body whether verified, unknown, or rate-limited',
    new Set(shapes).size === 1, shapes);
  check('resend always returns 200',
    [resendVerified, resendUnknown, resendExhausted].every((r) => r.status === 200));

  const sendsBefore = (await rawOne<any>('SELECT verification_sent_count FROM users WHERE lower(email) = $1', [exhausted]))
    ?.verification_sent_count;
  check('the daily send budget is enforced', Number(sendsBefore) === 5, sendsBefore);

  // ── Sweeping expired registrations ──────────────────────────────────────────
  section('Expired pending registrations are swept');

  const abandoned = `verify-sweep-${stamp}@konstructum.com`;
  await call(registerHandler, { method: 'POST', body: { email: abandoned, password } });
  const before = await rawOne<any>('SELECT id, verification_token_expires_at FROM users WHERE lower(email) = $1', [abandoned]);
  check('the pending account exists', Boolean(before?.id), before);

  await raw(
    `UPDATE users SET verification_token_expires_at = now() - INTERVAL '1 hour' WHERE id = $1`,
    [before.id],
  );

  const swept = await sweepExpiredRegistrations();
  check('the sweep removed at least one row', swept >= 1, swept);
  const gone = await rawOne<any>('SELECT id FROM users WHERE lower(email) = $1', [abandoned]);
  check('the expired pending account is gone', gone === null, gone);

  const reRegister = await call(registerHandler, {
    method: 'POST',
    body: { email: abandoned, password, displayName: 'Second Attempt' },
  });
  check('the address can sign up again after being swept', reRegister.status === 201, reRegister.body);

  // A verified account must never be swept, however old.
  await raw(
    `UPDATE users SET verification_token_expires_at = now() - INTERVAL '1 year' WHERE lower(email) = $1`,
    [emailA],
  );
  await sweepExpiredRegistrations();
  const verifiedSurvived = await rawOne<any>(
    'SELECT id, email, email_verified_at FROM users WHERE lower(email) = $1', [emailA],
  );
  check('a VERIFIED account is never swept, however old its expiry',
    Boolean(verifiedSurvived?.id) && verifiedSurvived?.email_verified_at !== null, verifiedSurvived);

  // ── An unverified account is inert everywhere ──────────────────────────────
  section('An unverified account is refused by every authorisation check');

  const pending = `verify-pending-${stamp}@konstructum.com`;
  await call(registerHandler, { method: 'POST', body: { email: pending, password } });

  // Forge a session cookie for the pending account, as an attacker who somehow
  // obtained one would. The server must not honour it.
  const { issueSessionToken } = await import('../api/_lib/auth.js');
  const forged = await issueSessionToken(
    (await rawOne<any>('SELECT id FROM users WHERE lower(email) = $1', [pending])).id,
    pending,
  );
  const pendingSession = await call(sessionHandler, { cookie: `kairos_session=${encodeURIComponent(forged)}` });
  check('a forged session for an unverified account resolves to no user',
    pendingSession.body?.user === null, pendingSession.body);

  const pendingList = await call(usersHandler, { cookie: `kairos_session=${encodeURIComponent(forged)}` });
  check('an unverified session is refused by a protected endpoint', pendingList.status === 401, pendingList.status);

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\n  failed:');
    for (const label of failures) console.log(`    - ${label}`);
  }
  console.log('');
  process.exit(failed ? 1 : 0);
}

/** Returns the code sent immediately before `code` — i.e. the superseded one. */
function lastCodeBefore(sent: Array<{ to: string; code: string }>, code: string): string {
  const index = sent.map((s) => s.code).lastIndexOf(code);
  return index > 0 ? sent[index - 1].code : '';
}

main().catch((error) => {
  console.error('\n  suite crashed:', error);
  process.exit(1);
});
