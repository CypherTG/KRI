import { requireAdmin, requireSession, isPinnedAdmin, requireAllowedEmail, USER_PUBLIC_COLUMNS, invalidateSessionCache } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, toNumber, toBoolean, optionalString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { mapUser } from '../_lib/mappers.js';
import { permissionsMode } from '../_lib/scope.js';

/**
 * GET   /api/users            — people registry (active users)
 * POST  /api/users            — admin: create a user without a password
 * PATCH /api/users?id=…       — admin: edit a user / toggle admin
 */
export default methodGuard(['GET', 'POST', 'PATCH'], async (req, res) => {
  const session = await requireSession(req);

  if (req.method === 'GET') {
    const rows = await raw<any>(
      `SELECT ${USER_PUBLIC_COLUMNS} FROM users
        WHERE is_active = TRUE
        ORDER BY lower(COALESCE(display_name, title, email)) ASC`,
    );
    return sendJson(res, 200, { users: rows.map(mapUser), canManage: session.isAdmin });
  }

  const admin = await requireAdmin(req);
  const body = await readJson(req);

  if (req.method === 'POST') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email) throw new HttpError(400, 'An email address is required.');
    // The same company-domain rule that guards registration guards this route,
    // otherwise an admin could mint an account on any domain and the boundary
    // would only hold for accounts that happened to self-register.
    requireAllowedEmail(email);
    const existing = await rawOne('SELECT id FROM users WHERE lower(email) = $1', [email]);
    if (existing) throw new HttpError(409, 'A user with that email already exists.');
    const row = await rawOne<any>(
      `INSERT INTO users (email, display_name, title, job_title, department, is_admin, is_active, target_clients, target_deals, join_date)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8,CURRENT_DATE) RETURNING *`,
      [
        email,
        optionalString(body.displayName ?? body.name, 120) || email.split('@')[0],
        optionalString(body.displayName ?? body.name, 120) || email.split('@')[0],
        optionalString(body.jobTitle, 200),
        optionalString(body.department, 200),
        toBoolean(body.isAdmin, false) || isPinnedAdmin(email),
        toNumber(body.targetClients, 0),
        toNumber(body.targetDeals, 0),
      ],
    );
    return sendJson(res, 201, { user: mapUser(row) });
  }

  const id = String(req.query.id ?? '').trim();
  if (!id) throw new HttpError(400, 'A user id is required.');
  const target = await rawOne<any>(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  if (!target) throw new HttpError(404, 'User not found.');

  const assignments: string[] = [];
  const values: any[] = [];
  const bind = (value: any) => {
    values.push(value);
    return `$${values.length}`;
  };

  if ('isAdmin' in body || 'is_admin' in body) {
    const nextAdmin = toBoolean(body.isAdmin ?? body.is_admin, false);
    if (isPinnedAdmin(target.email) && !nextAdmin) {
      throw new HttpError(400, 'The founding administrator cannot be demoted.');
    }
    assignments.push(`is_admin = ${bind(nextAdmin)}`);
  }
  if ('isActive' in body || 'is_active' in body) {
    if (id === admin.id) throw new HttpError(400, 'You cannot deactivate your own account.');
    assignments.push(`is_active = ${bind(toBoolean(body.isActive ?? body.is_active, true))}`);
  }
  if ('displayName' in body || 'name' in body) {
    const name = optionalString(body.displayName ?? body.name, 120) || String(target.display_name || '');
    assignments.push(`display_name = ${bind(name)}`);
    assignments.push(`title = ${bind(name)}`);
  }
  if ('jobTitle' in body) assignments.push(`job_title = ${bind(optionalString(body.jobTitle, 200))}`);
  if ('department' in body) assignments.push(`department = ${bind(optionalString(body.department, 200))}`);
  if ('targetClients' in body) assignments.push(`target_clients = ${bind(toNumber(body.targetClients, 0))}`);
  if ('targetDeals' in body) assignments.push(`target_deals = ${bind(toNumber(body.targetDeals, 0))}`);
  if ('profilePhoto' in body) assignments.push(`profile_photo = ${bind(optionalString(body.profilePhoto, 1000))}`);

  if (assignments.length) {
    values.push(id);
    await raw(`UPDATE users SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
    invalidateSessionCache(id);
  }

  const row = await rawOne<any>(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return sendJson(res, 200, { user: mapUser(row), permissionsMode: permissionsMode() });
});
