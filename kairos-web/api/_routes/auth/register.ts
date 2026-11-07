import { hashPassword, isPinnedAdmin } from '../../_lib/auth.js';
import { methodGuard, readJson, sendJson, isValidEmail, requireString, HttpError } from '../../_lib/http.js';
import { rawOne } from '../../_lib/db.js';
import { requireAllowedEmail } from '../../_lib/auth.js';
import {
  issueVerificationToken,
  sweepExpiredRegistrations,
  MAX_SENDS_PER_DAY,
} from '../../_lib/verification.js';
import { sendVerificationCode, MailDeliveryError } from '../../_lib/mailer.js';

/**
 * POST /api/auth/register — create an account and mail a verification code.
 *
 * The account is created with `email_verified_at` left NULL and is therefore
 * inert: it cannot sign in, cannot be issued a session, and is refused by every
 * authorisation check. Only redeeming the emailed code makes it live.
 *
 * That is the whole point of this endpoint. Registration is limited to the
 * group's own email domains, so without a proof-of-ownership step anyone could
 * register as a colleague and hold a real account under their name — appearing
 * in the people registry, the audit trail and every report as a person who never
 * existed.
 *
 * No session is issued here. Returning one would mean the browser could skip
 * verification entirely.
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

  // Clears out registrations whose code expired unused, otherwise the address
  // stays blocked forever by an account nobody completed. Run lazily because
  // there is no reliable cron on this platform.
  await sweepExpiredRegistrations();

  const existing = await rawOne('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (existing) throw new HttpError(409, 'An account with that email already exists. Sign in instead.');

  const passwordHash = await hashPassword(password);

  const created = await rawOne<any>(
    `INSERT INTO users (email, password_hash, display_name, title, job_title, is_admin, is_active, join_date)
     VALUES ($1, $2, $3, $3, $4, $5, TRUE, CURRENT_DATE)
     RETURNING id, email`,
    [
      email,
      passwordHash,
      displayName,
      typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '',
      isPinnedAdmin(email),
    ],
  );

  const issue = await issueVerificationToken(email);

  if (issue.ok && issue.token) {
    try {
      await sendVerificationCode({
        to: email,
        code: issue.token,
        appName: process.env.MAIL_APP_NAME || 'KAIROS',
      });
    } catch (error) {
      // Roll the account back. Leaving it behind would lock the address out of
      // signing up again and produce a silent, inexplicable failure for a person
      // who did nothing wrong.
      await rawOne('DELETE FROM users WHERE id = $1 RETURNING id', [created.id]);

      const detail = error instanceof MailDeliveryError
        ? error.message
        : 'The verification email could not be sent.';
      console.error('[auth] registration rolled back after mail failure', {
        email,
        message: detail,
      });
      throw new HttpError(503, `${detail} Your account was not created — please try again.`);
    }
  }

  // A send-budget or already-verified outcome cannot normally reach here for a
  // brand new account, but if it does the account is still inert and the
  // response must not claim otherwise.
  return sendJson(res, 201, {
    // Deliberately no token, no user, no cookie.
    requiresVerification: true,
    email,
    maxSendsPerDay: MAX_SENDS_PER_DAY,
  });
});
