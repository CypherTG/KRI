import { loadSessionUser, clearSessionCookie } from '../../_lib/auth.js';
import { methodGuard, sendJson } from '../../_lib/http.js';
import { rawOne } from '../../_lib/db.js';
import { toSessionUser } from '../../_lib/auth.js';

/**
 * GET  /api/auth/session — resolve the current session (called on app boot).
 * POST /api/auth/session — clear the session cookie.
 *
 * The payload uses the camelCase session shape the browser's auth store
 * hydrates from, not the PascalCase `IKRIUser` shape the rest of the API uses.
 */
export default methodGuard(['GET', 'POST'], async (req, res) => {
  if (req.method === 'POST') {
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  const user = await loadSessionUser(req);
  if (!user) return sendJson(res, 200, { user: null, isAdmin: false });

  return sendJson(res, 200, {
    user,
    isAdmin: user.isAdmin,
  });
});
