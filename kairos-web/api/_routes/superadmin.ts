import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession, hashPassword, invalidateSessionCache, USER_PUBLIC_COLUMNS } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, HttpError, optionalString, toBoolean } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';

export const SUPERADMIN_EMAILS = ['mbello@konstructum.com'];

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPERADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}

/**
 * Superadmin endpoint:
 *   GET   /api/superadmin        — Full system telemetry, user registry, and files
 *   PATCH /api/superadmin?id=…   — Promote/demote admin, reset password, activate/deactivate
 *   POST  /api/superadmin        — System actions (e.g. action: "rebuild-lookups")
 */
export default methodGuard(['GET', 'PATCH', 'POST'], async (req: VercelRequest, res: VercelResponse) => {
  const session = await requireSession(req);

  if (!isSuperAdmin(session.email)) {
    throw new HttpError(403, 'Access denied. The Superadmin console is restricted exclusively to the Founding Super Administrator.');
  }

  if (req.method === 'GET') {
    // 1. Users registry
    const users = await raw<any>(
      `SELECT id, email, display_name, title, job_title, department, is_admin, is_active,
              email_verified_at, target_clients, target_deals, join_date, created_at
         FROM users
        ORDER BY is_admin DESC, lower(email) ASC`
    );

    // 2. Metrics & Counts
    const tables = [
      'clients', 'companies', 'communications', 'engagements',
      'automations', 'stage_history', 'company_acumen', 'biodata', 'contact_access_requests'
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

    // 3. Storage diagnostic
    const storage = {
      blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      provider: process.env.BLOB_READ_WRITE_TOKEN ? 'Vercel Blob (Cloud Object Storage)' : 'PostgreSQL Database Fallback (Inline Base64)',
    };

    // 4. Recent documents
    let documents: any[] = [];
    try {
      documents = await raw<any>(
        `SELECT id, company_name, file_name, content_type, size_bytes, uploaded_by_label, uploaded_at
           FROM company_acumen
          ORDER BY uploaded_at DESC
          LIMIT 25`
      );
    } catch {
      documents = [];
    }

    // 5. Recent stage audit history
    let auditLog: any[] = [];
    try {
      auditLog = await raw<any>(
        `SELECT sh.id, sh.client_id, sh.previous_stage, sh.new_stage, sh.changed_by_label, sh.changed_date, sh.notes,
                c.first_name || ' ' || c.last_name AS client_name, c.company_name
           FROM stage_history sh
           LEFT JOIN clients c ON c.id = sh.client_id
          ORDER BY sh.changed_date DESC
          LIMIT 20`
      );
    } catch {
      auditLog = [];
    }

    return sendJson(res, 200, {
      superadmin: session.email,
      systemStatus: 'Operational',
      storage,
      counts,
      users,
      documents,
      auditLog,
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

    // Admin toggle
    if ('isAdmin' in body || 'is_admin' in body) {
      const nextAdmin = toBoolean(body.isAdmin ?? body.is_admin, false);
      if (isSuperAdmin(target.email) && !nextAdmin) {
        throw new HttpError(400, 'The Super Administrator account cannot be stripped of admin privileges.');
      }
      assignments.push(`is_admin = ${bind(nextAdmin)}`);
    }

    // Active toggle
    if ('isActive' in body || 'is_active' in body) {
      const nextActive = toBoolean(body.isActive ?? body.is_active, true);
      if (target.id === session.id && !nextActive) {
        throw new HttpError(400, 'You cannot deactivate your own Superadmin account.');
      }
      assignments.push(`is_active = ${bind(nextActive)}`);
    }

    // Password reset override
    if (typeof body.password === 'string' && body.password.trim()) {
      if (body.password.length < 8) {
        throw new HttpError(400, 'New password must be at least 8 characters long.');
      }
      const hash = await hashPassword(body.password.trim());
      assignments.push(`password_hash = ${bind(hash)}`);
      assignments.push(`email_verified_at = now()`); // Verified upon admin reset
    }

    // Role / Title metadata
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

  if (req.method === 'POST') {
    const body = await readJson(req);
    const action = String(body.action || '').trim();

    if (action === 'rebuild-lookups') {
      // Rebuild distinct companies
      await raw(
        `INSERT INTO companies (company_key, company_name, canonical_name, status)
         SELECT DISTINCT lower(company_name), company_name, company_name, 'Active'
           FROM clients
          WHERE COALESCE(company_name,'') <> ''
         ON CONFLICT (company_key) DO NOTHING`
      );
      await raw(
        `UPDATE companies co SET contact_count = COALESCE(
            (SELECT count(*) FROM clients c WHERE lower(c.company_name) = co.company_key), 0)`
      );

      // Rebuild distinct job titles
      await raw(
        `INSERT INTO job_titles (title)
         SELECT DISTINCT job_title FROM clients WHERE COALESCE(job_title,'') <> ''
         ON CONFLICT (title) DO NOTHING`
      );

      // Rebuild distinct projects
      await raw(
        `INSERT INTO projects (name)
         SELECT DISTINCT project_name FROM clients WHERE COALESCE(project_name,'') <> ''
         ON CONFLICT (name) DO NOTHING`
      );

      return sendJson(res, 200, { ok: true, message: 'Lookups rebuilt successfully from 446+ contacts registry.' });
    }

    throw new HttpError(400, `Unknown superadmin action: "${action}"`);
  }
});
