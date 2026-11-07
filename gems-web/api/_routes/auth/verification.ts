import { methodGuard, readJson, sendJson, requireString } from '../../_lib/http.js';
import { rawOne } from '../../_lib/db.js';
import {
  issueVerificationToken,
  checkVerificationToken,
  consumeVerificationToken,
  GENERIC_VERIFICATION_ERROR,
} from '../../_lib/verification.js';
import { sendVerificationCode, MailDeliveryError } from '../../_lib/mailer.js';

/**
 * POST /api/auth/resend-code — email another verification code.
 *
 * Returns an identical 200 for every outcome: unknown address, already verified,
 * send budget spent, or a code sent successfully. Any variation turns this into
 * an account-enumeration oracle that lets a stranger test whether a colleague has
 * an account here.
 *
 * Rate limiting is the point of this endpoint — it is the cheapest abuse vector
 * in the whole flow, and the per-address budget in `issueVerificationToken` is
 * what stops a mailbox owner being mail-bombed.
 */
export default methodGuard(['POST'], async (req, res) => {
  const body = await readJson(req);
  const email = requireString(body.email, 'email', { max: 200 }).toLowerCase();

  // Never let a delivery failure become a distinguishable response either.
  try {
    const issue = await issueVerificationToken(email);
    if (issue.ok && issue.token) {
      await sendVerificationCode({
        to: email,
        code: issue.token,
        appName: process.env.MAIL_APP_NAME || 'KAIROS',
      });
    } else {
      console.info('[auth] resend-code suppressed', {
        email,
        reason: issue.rateLimited ? 'rate-limited' : issue.alreadyVerified ? 'already-verified' : 'unknown',
      });
    }
  } catch (error) {
    console.error('[auth] resend-code delivery failed', {
      email,
      message: error instanceof MailDeliveryError ? error.message : String(error),
    });
  }

  // Byte-identical regardless of what happened above.
  return sendJson(res, 200, {
    ok: true,
    message: 'If that address needs a code, one is on its way.',
  });
});

/**
 * GET /api/auth/sign-in — does this address need a code?
 *
 * Exists so the sign-in form can decide whether to show the code field. It
 * returns nothing an attacker can act on: `needsToken` is only true for an
 * address that genuinely has an outstanding code, and an unknown address is
 * indistinguishable from a verified one.
 */
export const signInProbeHandler = methodGuard(['GET'], async (req, res) => {
  const email = String(req.query.email ?? '').trim().toLowerCase();

  // A malformed address is treated exactly like an unknown one.
  if (!email || !email.includes('@') || email.length > 200) {
    return sendJson(res, 200, { needsToken: false });
  }

  const row = await rawOne<any>(
    `SELECT email_verified_at, require_token_every_signin, verification_token_hash,
            verification_token_expires_at
       FROM users
      WHERE lower(email) = $1`,
    [email],
  );

  if (!row) return sendJson(res, 200, { needsToken: false });

  const mustHaveCode = row.require_token_every_signin === true || !row.email_verified_at;

  // Only "this address is waiting on a code" is meaningful. Revealing that an
  // account exists but is unverified would still be an enumeration oracle, so an
  // unverified address with nothing outstanding reads as false.
  if (mustHaveCode) {
    const hasLiveCode = Boolean(
      row.verification_token_hash
      && row.verification_token_expires_at
      && new Date(row.verification_token_expires_at).getTime() > Date.now(),
    );
    if (hasLiveCode) return sendJson(res, 200, { needsToken: true });
  }

  return sendJson(res, 200, { needsToken: false });
});

/**
 * POST /api/auth/verify — redeem a code without signing in.
 *
 * Separate from sign-in so the code can be redeemed first and the account
 * activated, rather than forcing a full sign-in to prove ownership.
 */
export const verifyHandler = methodGuard(['POST'], async (req, res) => {
  const body = await readJson(req);
  const email = requireString(body.email, 'email', { max: 200 }).toLowerCase();
  const token = requireString(body.token, 'token', { max: 64 });

  const check = await checkVerificationToken(email, token);
  if (!check.ok) {
    return sendJson(res, 403, { error: GENERIC_VERIFICATION_ERROR, needsToken: true });
  }

  const consumed = await consumeVerificationToken(email, token);
  if (!consumed) {
    // Lost a race with a concurrent request; the code is already spent.
    return sendJson(res, 403, { error: GENERIC_VERIFICATION_ERROR, needsToken: false });
  }

  return sendJson(res, 200, { verified: true });
});
