import { loadSessionUser, clearSessionCookie, issueSessionToken } from '../../_lib/auth.js';
import { methodGuard, sendJson } from '../../_lib/http.js';

/**
 * GET  /api/auth/session — resolve the current session (called on app boot).
 * POST /api/auth/session — clear the session cookie.
 */
export default methodGuard(['GET', 'POST'], async (req, res) => {
  if (req.method === 'POST') {
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  const user = await loadSessionUser(req);
  if (!user) return sendJson(res, 200, { user: null, isAdmin: false, isSuperAdmin: false });

  const token = await issueSessionToken(user.id, user.email);
  return sendJson(res, 200, {
    token,
    user,
    isAdmin: user.isAdmin,
    isSuperAdmin: user.isSuperAdmin,
  });
});
