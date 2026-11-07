import {
  issueSessionToken,
  setSessionCookie,
  toSessionUser,
  verifyPassword,
  requireAllowedEmail,
  USER_PUBLIC_COLUMNS,
} from '../../_lib/auth.js';
import { methodGuard, readJson, sendJson, requireString, HttpError } from '../../_lib/http.js';
import { rawOne } from '../../_lib/db.js';
import {
  needsToken,
  checkVerificationToken,
  consumeVerificationToken,
} from '../../_lib/verification.js';

/**
 * A real bcrypt hash of a value nobody knows, used when no account matches.
 *
 * Verifying against this keeps a missing account and a wrong password taking
 * comparable time. Without it, "no such user" returns in microseconds while a
 * real account costs a deliberate bcrypt round, which is a timing oracle for
 * whether an address is registered.
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/** Thrown when a code is required but missing or wrong. The client keys off `needsToken`. */
class TokenRequiredError extends HttpError {
  needsToken = true;
  constructor(message: string) {
    super(403, message);
    this.name = 'TokenRequiredError';
  }
}

/** POST /api/auth/login — exchange credentials, and a code, for a session. */
export default methodGuard(['POST'], async (req, res) => {
  const body = await readJson(req);
  const email = requireString(body.email, 'email', { max: 200 }).toLowerCase();
  const password = requireString(body.password, 'password', { max: 200 });
  const token = typeof body.token === 'string' ? body.token.trim().toUpperCase() : '';

  const row = await rawOne<any>(
    `SELECT ${USER_PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = $1`,
    [email],
  );

  // The company-domain rule is checked before anything else, exactly as it was
  // before verification existed. It must precede the password check so the
  // refusal is identical for every non-company address; checking afterwards
  // would confirm whether an account exists there.
  requireAllowedEmail(email);

  // Always run a password verification, even when no user was found, so that a
  // missing account and a wrong password take comparable time.
  const ok = await verifyPassword(password, row?.password_hash || DUMMY_HASH);
  if (!row || !ok) throw new HttpError(401, 'Email or password is incorrect.');

  if (row.is_active === false) {
    throw new HttpError(403, 'Your account has been deactivated. Contact an administrator.');
  }

  // Either never proved the mailbox, or is hardened and must re-prove each time.
  if (needsToken(row) || row.require_token_every_signin) {
    const check = await checkVerificationToken(email, token);
    if (!check.ok) {
      // needsToken tells the client to reveal its code field, without telling an
      // attacker whether this particular account exists.
      throw new TokenRequiredError(check.error);
    }
    await consumeVerificationToken(email, token);
  }

  // Re-read so the session reflects the verification that just happened.
  const fresh = await rawOne<any>('SELECT * FROM users WHERE id = $1', [row.id]);

  const sessionToken = await issueSessionToken(row.id, email);
  setSessionCookie(res, sessionToken);

  const session = toSessionUser(fresh || row);
  return sendJson(res, 200, { token: sessionToken, user: session, isAdmin: session.isAdmin });
});
