import { hashPassword, isPinnedAdmin, issueSessionToken, setSessionCookie, toSessionUser, requireAllowedEmail } from '../../_lib/auth.js';
import { methodGuard, readJson, sendJson, isValidEmail, requireString, HttpError } from '../../_lib/http.js';
import { rawOne } from '../../_lib/db.js';

/**
 * POST /api/auth/register — create a KAIROS account and sign in.
 *
 * A new account starts with zero owned contacts, so the workspace is empty
 * until an administrator assigns records (or the user is granted access via
 * an access request). Everyone can register; nobody sees anything by default.
 */
export default methodGuard(['POST'], async (req, res) => {
  const body = await readJson(req);
  const email = requireString(body.email, 'email', { max: 200 }).toLowerCase();
  const password = requireString(body.password, 'password', { max: 200 });
  const displayName =
    requireString(body.displayName || body.display_name, 'displayName', { max: 120, required: false }) || email.split('@')[0];

  if (!isValidEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');

  // Company domains only, before anything touches the database.
  requireAllowedEmail(email);

  const existing = await rawOne('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (existing) throw new HttpError(409, 'An account with that email already exists. Sign in instead.');

  const passwordHash = await hashPassword(password);

  const created = await rawOne<any>(
    `INSERT INTO users (email, password_hash, display_name, title, job_title, is_admin, is_active, join_date)
     VALUES ($1, $2, $3, $3, $4, $5, TRUE, CURRENT_DATE)
     RETURNING *`,
    [
      email,
      passwordHash,
      displayName,
      typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '',
      isPinnedAdmin(email),
    ],
  );

  const token = await issueSessionToken(created.id, email);
  setSessionCookie(res, token);

  const session = toSessionUser(created);
  return sendJson(res, 201, { token, user: session, isAdmin: session.isAdmin });
});
