import {
  issueSessionToken,
  setSessionCookie,
  toSessionUser,
  verifyPassword,
  requireAllowedEmail,
  USER_PUBLIC_COLUMNS,
} from '../../_lib/auth.js';
import { methodGuard, readJson, sendJson, isValidEmail, requireString, HttpError } from '../../_lib/http.js';
import { rawOne } from '../../_lib/db.js';

/** POST /api/auth/login — exchange credentials for a session cookie. */
export default methodGuard(['POST'], async (req, res) => {
  const body = await readJson(req);
  const email = requireString(body.email, 'email', { max: 200 }).toLowerCase();
  const password = requireString(body.password, 'password', { max: 200 });

  // Checked before the password, and identically for every address outside the
  // permitted domains. Doing it after the credential check would confirm that a
  // given non-domain account exists and that the password is right, which turns
  // the response into an account oracle. Rejecting up front means the reply is
  // the same 403 whether or not the account exists.
  requireAllowedEmail(email);

  const row = await rawOne<any>(
    `SELECT ${USER_PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = $1`,
    [email],
  );

  // Always run a hash comparison so a missing account and a wrong password
  // take the same amount of time.
  const ok = await verifyPassword(password, row?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!row || !ok) throw new HttpError(401, 'Email or password is incorrect.');

  if (row.is_active === false) {
    throw new HttpError(403, 'Your account has been deactivated. Contact an administrator.');
  }

  const token = await issueSessionToken(row.id, email);
  setSessionCookie(res, token);

  const session = toSessionUser(row);
  return sendJson(res, 200, { token, user: session, isAdmin: session.isAdmin });
});
