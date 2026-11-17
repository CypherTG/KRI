import { hashPassword, isPinnedAdmin, requireSuperAdmin, requireAllowedEmailAsync, toSessionUser } from '../../_lib/auth.js';
import { methodGuard, readJson, sendJson, isValidEmail, requireString, HttpError, toBoolean } from '../../_lib/http.js';
import { rawOne } from '../../_lib/db.js';

/**
 * POST /api/auth/register — Restricted exclusively to Super Administrators.
 * Public self-registration is disabled for this corporate application.
 */
export default methodGuard(['POST'], async (req, res) => {
  await requireSuperAdmin(req);

  const body = await readJson(req);
  const email = requireString(body.email, 'email', { max: 200 }).toLowerCase().trim();
  const password = requireString(body.password, 'password', { max: 200 });
  const displayName =
    requireString(body.displayName || body.display_name, 'displayName', { max: 120, required: false }) || email.split('@')[0];

  if (!isValidEmail(email)) throw new HttpError(400, 'Enter a valid corporate email address.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');

  await requireAllowedEmailAsync(email);

  const existing = await rawOne('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (existing) throw new HttpError(409, 'An account with that email already exists.');

  const passwordHash = await hashPassword(password);
  const isAdmin = toBoolean(body.isAdmin, false) || isPinnedAdmin(email);
  const isSuperAdmin = toBoolean(body.isSuperAdmin, false);

  const created = await rawOne<any>(
    `INSERT INTO users (email, password_hash, display_name, title, job_title, department, is_admin, is_superadmin, is_active, email_verified_at, join_date)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, TRUE, now(), CURRENT_DATE)
     RETURNING *`,
    [
      email,
      passwordHash,
      displayName,
      typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '',
      typeof body.department === 'string' ? body.department.trim() : 'Konstructum',
      isAdmin || isSuperAdmin,
      isSuperAdmin,
    ],
  );

  const session = toSessionUser(created);
  return sendJson(res, 201, { user: session, isAdmin: session.isAdmin, isSuperAdmin: session.isSuperAdmin });
});
