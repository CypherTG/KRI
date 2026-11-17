import {
  issueSessionToken,
  setSessionCookie,
  toSessionUser,
  verifyPassword,
  requireAllowedEmailAsync,
  getAllowedDomainsList,
  invalidateSessionCache,
  USER_PUBLIC_COLUMNS,
} from '../../_lib/auth.js';
import { methodGuard, readJson, sendJson, requireString, HttpError } from '../../_lib/http.js';
import { raw, rawOne } from '../../_lib/db.js';
import { jwtVerify } from 'jose';

const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/**
 * GET  /api/auth/login — public auth metadata (allowed corporate domains + SSO config)
 * POST /api/auth/login — exchange credentials or Group Intranet SSO for a session
 */
export default methodGuard(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const domains = await getAllowedDomainsList();
    let ssoEnabled = true;
    let intranetPortalUrl = 'https://intranet.konstructum.com';
    try {
      const settings = await raw<any>(
        `SELECT key, value FROM platform_settings WHERE key IN ('intranet_sso_enabled', 'intranet_portal_url')`,
      );
      for (const s of settings || []) {
        if (s.key === 'intranet_sso_enabled') ssoEnabled = s.value !== 'false';
        if (s.key === 'intranet_portal_url' && s.value) intranetPortalUrl = s.value;
      }
    } catch {
      // default values
    }
    return sendJson(res, 200, {
      allowedDomains: domains.filter((d) => d.is_active),
      ssoEnabled,
      intranetPortalUrl,
    });
  }

  const body = await readJson(req);
  const mode = String(body.mode || 'password').trim().toLowerCase();
  const ssoToken = typeof body.ssoToken === 'string' ? body.ssoToken.trim() : '';

  // 1. Cross-app / Intranet signed SSO token handoff
  if (ssoToken) {
    const secret = process.env.SESSION_SECRET || '';
    if (secret.length >= 32) {
      try {
        const { payload } = await jwtVerify(ssoToken, new TextEncoder().encode(secret), { issuer: 'kairos' });
        if (typeof payload.sub === 'string' && payload.sub) {
          const row = await rawOne<any>(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1`, [payload.sub]);
          if (row && row.is_active !== false) {
            await raw(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, [row.id]);
            invalidateSessionCache(String(row.id));
            const sessionToken = await issueSessionToken(String(row.id), String(row.email));
            setSessionCookie(res, sessionToken);
            const session = toSessionUser({ ...row, email_verified_at: row.email_verified_at || new Date().toISOString() });
            return sendJson(res, 200, {
              token: sessionToken,
              user: session,
              isAdmin: session.isAdmin,
              isSuperAdmin: session.isSuperAdmin,
            });
          }
        }
      } catch {
        throw new HttpError(401, 'Intranet SSO token has expired or is invalid. Please sign in again.');
      }
    }
  }

  const email = requireString(body.email, 'email', { max: 200 }).toLowerCase().trim();
  await requireAllowedEmailAsync(email);

  const row = await rawOne<any>(
    `SELECT ${USER_PUBLIC_COLUMNS}, password_hash FROM users WHERE lower(email) = $1`,
    [email],
  );

  // 2. Group Intranet SSO Corporate Identity Sign-In
  if (mode === 'sso') {
    let ssoEnabled = true;
    try {
      const setting = await rawOne<{ value: string }>(
        `SELECT value FROM platform_settings WHERE key = 'intranet_sso_enabled'`,
      );
      if (setting && setting.value === 'false') ssoEnabled = false;
    } catch {
      ssoEnabled = true;
    }

    if (!ssoEnabled) {
      throw new HttpError(403, 'Group Intranet SSO is currently disabled by the Super Administrator. Sign in with your password.');
    }

    if (!row) {
      throw new HttpError(
        403,
        'This corporate email has not been provisioned yet. Only the Super Administrator can grant access and invite users.',
      );
    }

    if (row.is_active === false) {
      throw new HttpError(403, 'Your account has been deactivated. Contact the Super Administrator.');
    }

    await raw(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, [row.id]);
    invalidateSessionCache(String(row.id));

    const sessionToken = await issueSessionToken(String(row.id), email);
    setSessionCookie(res, sessionToken);

    const session = toSessionUser({ ...row, email_verified_at: row.email_verified_at || new Date().toISOString() });
    return sendJson(res, 200, {
      token: sessionToken,
      user: session,
      isAdmin: session.isAdmin,
      isSuperAdmin: session.isSuperAdmin,
    });
  }

  // 3. Standard Corporate Password Sign-In
  const password = requireString(body.password, 'password', { max: 200 });
  const ok = await verifyPassword(password, row?.password_hash || DUMMY_HASH);
  if (!row || !ok) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }

  if (row.is_active === false) {
    throw new HttpError(403, 'Your account has been deactivated. Contact an administrator.');
  }

  if (!row.email_verified_at) {
    await raw(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [row.id]);
    row.email_verified_at = new Date().toISOString();
  }
  invalidateSessionCache(String(row.id));

  const sessionToken = await issueSessionToken(String(row.id), email);
  setSessionCookie(res, sessionToken);

  const session = toSessionUser(row);
  return sendJson(res, 200, {
    token: sessionToken,
    user: session,
    isAdmin: session.isAdmin,
    isSuperAdmin: session.isSuperAdmin,
  });
});
