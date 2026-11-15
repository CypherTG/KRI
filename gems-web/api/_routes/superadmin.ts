import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession, hashPassword, invalidateSessionCache, USER_PUBLIC_COLUMNS } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, HttpError, optionalString, toBoolean } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';

export const SUPERADMIN_EMAILS = ['mbello@konstructum.com'];

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPERADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}

export default methodGuard(['GET', 'PATCH', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const session = await requireSession(req);

  if (!isSuperAdmin(session.email)) {
    throw new HttpError(403, 'Access denied. The Superadmin console is restricted exclusively to the Founding Super Administrator.');
  }

  if (req.method === 'GET') {
    const users = await raw<any>(
      `SELECT id, email, display_name, title, job_title, department, is_admin, is_active,
              email_verified_at, target_clients, target_deals, join_date, created_at
         FROM users
        ORDER BY is_admin DESC, lower(email) ASC`
    );

    const tables = [
      'clients', 'companies', 'communications', 'engagements',
      'gems_interactions', 'gems_compliance', 'gems_actions', 'gems_audit_log'
    ];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      try {
        const result = await rawOne<any>(`SELECT count(*)::int AS total FROM ${table}`);
        counts[table] = Number(result?.total || 0);
      } catch {
        counts[table] = 0;
      }
    }

    const storage = {
      blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      provider: process.env.BLOB_READ_WRITE_TOKEN ? 'Vercel Blob (Cloud Object Storage)' : 'PostgreSQL Database Fallback (Inline Base64)',
    };

    return sendJson(res, 200, {
      superadmin: session.email,
      systemStatus: 'Operational',
      storage,
      counts,
      users,
    });
  }

  if (req.method === 'PATCH') {
    const id = String(req.query.id ?? '').trim();
    if (!id) throw new HttpError(400, 'User ID is required.');

    const target = await rawOne<any>('SELECT * FROM users WHERE id = $1', [id]);
    if (!target) throw new HttpError(404, 'User not found.');

    const body = await readJson(req);
    const assignments: string[] = [];
    const values: any[] = [];
    const bind = (val: any) => {
      values.push(val);
      return `$${values.length}`;
    };

    if ('isAdmin' in body || 'is_admin' in body) {
      const nextAdmin = toBoolean(body.isAdmin ?? body.is_admin, false);
      if (isSuperAdmin(target.email) && !nextAdmin) {
        throw new HttpError(400, 'The Super Administrator account cannot be stripped of admin privileges.');
      }
      assignments.push(`is_admin = ${bind(nextAdmin)}`);
    }

    if ('isActive' in body || 'is_active' in body) {
      const nextActive = toBoolean(body.isActive ?? body.is_active, true);
      if (target.id === session.id && !nextActive) {
        throw new HttpError(400, 'You cannot deactivate your own Superadmin account.');
      }
      assignments.push(`is_active = ${bind(nextActive)}`);
    }

    if (typeof body.password === 'string' && body.password.trim()) {
      if (body.password.length < 8) {
        throw new HttpError(400, 'New password must be at least 8 characters long.');
      }
      const hash = await hashPassword(body.password.trim());
      assignments.push(`password_hash = ${bind(hash)}`);
      assignments.push(`email_verified_at = now()`);
    }

    if ('jobTitle' in body) assignments.push(`job_title = ${bind(optionalString(body.jobTitle, 200))}`);
    if ('department' in body) assignments.push(`department = ${bind(optionalString(body.department, 200))}`);
    if ('displayName' in body) {
      const name = optionalString(body.displayName, 120);
      if (name) {
        assignments.push(`display_name = ${bind(name)}`);
        assignments.push(`title = ${bind(name)}`);
      }
    }

    if (assignments.length) {
      values.push(id);
      await raw(`UPDATE users SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
      invalidateSessionCache(id);
    }

    const updated = await rawOne<any>(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
    return sendJson(res, 200, { user: updated, message: 'User updated successfully.' });
  }

  throw new HttpError(405, 'Method not allowed.');
});
