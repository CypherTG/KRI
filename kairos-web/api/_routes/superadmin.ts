import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  requireSuperAdmin,
  hashPassword,
  invalidateSessionCache,
  invalidateDomainsCache,
  getAllowedDomainsList,
  requireAllowedEmailAsync,
  isPinnedSuperAdmin,
  issueSessionToken,
  USER_PUBLIC_COLUMNS,
} from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, HttpError, optionalString, toBoolean, isValidEmail, toNumber } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { sendVerificationCode } from '../_lib/mailer.js';

export const SUPERADMIN_EMAILS = ['mbello@konstructum.com'];

export function isSuperAdmin(email: string | null | undefined): boolean {
  return isPinnedSuperAdmin(email);
}

export default methodGuard(['GET', 'PATCH', 'POST', 'DELETE'], async (req: VercelRequest, res: VercelResponse) => {
  const session = await requireSuperAdmin(req);

  if (req.method === 'GET') {
    const users = await raw<any>(
      `SELECT id, email, display_name, title, job_title, department,
              is_admin, COALESCE(is_superadmin, false) AS is_superadmin, is_active,
              email_verified_at, target_clients, target_deals, join_date, created_at
         FROM users
        ORDER BY COALESCE(is_superadmin, false) DESC, is_admin DESC, lower(email) ASC`,
    );

    const tables = [
      'clients', 'companies', 'communications', 'engagements',
      'automations', 'stage_history', 'company_acumen', 'biodata', 'contact_access_requests',
      'gems_interactions', 'gems_compliance', 'gems_actions', 'gems_audit_log',
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
      provider: process.env.BLOB_READ_WRITE_TOKEN
        ? 'Vercel Blob (Cloud Object Storage)'
        : 'PostgreSQL Database Fallback (Inline Base64)',
    };

    let documents: any[] = [];
    try {
      documents = await raw<any>(
        `SELECT id, company_name, file_name, content_type, size_bytes, uploaded_by_label, uploaded_at
           FROM company_acumen
          ORDER BY uploaded_at DESC
          LIMIT 25`,
      );
    } catch {
      documents = [];
    }

    let auditLog: any[] = [];
    try {
      auditLog = await raw<any>(
        `SELECT sh.id, sh.client_id, sh.previous_stage, sh.new_stage, sh.changed_by_label, sh.changed_date, sh.notes,
                c.first_name || ' ' || c.last_name AS client_name, c.company_name
           FROM stage_history sh
           LEFT JOIN clients c ON c.id = sh.client_id
          ORDER BY sh.changed_date DESC
          LIMIT 20`,
      );
    } catch {
      auditLog = [];
    }

    const allowedDomains = await getAllowedDomainsList();

    const intranetSettings = {
      ssoEnabled: true,
      portalUrl: 'https://intranet.konstructum.com',
      ssoMode: 'trusted_corporate_sso',
    };
    try {
      const settingsRows = await raw<any>(
        `SELECT key, value FROM platform_settings WHERE key IN ('intranet_sso_enabled', 'intranet_portal_url', 'intranet_sso_mode')`,
      );
      for (const s of settingsRows || []) {
        if (s.key === 'intranet_sso_enabled') intranetSettings.ssoEnabled = s.value !== 'false';
        if (s.key === 'intranet_portal_url' && s.value) intranetSettings.portalUrl = s.value;
        if (s.key === 'intranet_sso_mode' && s.value) intranetSettings.ssoMode = s.value;
      }
    } catch {
      // default settings
    }

    return sendJson(res, 200, {
      superadmin: session.email,
      systemStatus: 'Operational',
      storage,
      counts,
      users,
      allowedDomains,
      intranetSettings,
      documents,
      auditLog,
    });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id ?? '').trim();
    if (!id) throw new HttpError(400, 'User ID is required.');
    if (id === session.id) throw new HttpError(400, 'You cannot delete your own Super Administrator account.');

    const target = await rawOne<any>('SELECT * FROM users WHERE id = $1', [id]);
    if (!target) throw new HttpError(404, 'User not found.');
    if (isPinnedSuperAdmin(target.email)) {
      throw new HttpError(400, 'The Founding Super Administrator account cannot be deleted.');
    }

    await raw('DELETE FROM users WHERE id = $1', [id]);
    invalidateSessionCache(id);
    return sendJson(res, 200, { deleted: true, message: `Deleted user ${target.email}.` });
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

    if ('isSuperAdmin' in body || 'is_superadmin' in body) {
      const nextSuper = toBoolean(body.isSuperAdmin ?? body.is_superadmin, false);
      if (isPinnedSuperAdmin(target.email) && !nextSuper) {
        throw new HttpError(400, 'The Founding Super Administrator cannot be demoted.');
      }
      assignments.push(`is_superadmin = ${bind(nextSuper)}`);
      if (nextSuper) {
        assignments.push(`is_admin = TRUE`);
      }
    }

    if ('isAdmin' in body || 'is_admin' in body) {
      const nextAdmin = toBoolean(body.isAdmin ?? body.is_admin, false);
      if (isPinnedSuperAdmin(target.email) && !nextAdmin) {
        throw new HttpError(400, 'The Founding Super Administrator cannot be stripped of admin privileges.');
      }
      assignments.push(`is_admin = ${bind(nextAdmin)}`);
    }

    if ('isActive' in body || 'is_active' in body) {
      const nextActive = toBoolean(body.isActive ?? body.is_active, true);
      if (target.id === session.id && !nextActive) {
        throw new HttpError(400, 'You cannot deactivate your own Superadmin account.');
      }
      if (isPinnedSuperAdmin(target.email) && !nextActive) {
        throw new HttpError(400, 'The Founding Super Administrator cannot be deactivated.');
      }
      assignments.push(`is_active = ${bind(nextActive)}`);
    }

    if (typeof body.password === 'string' && body.password.trim()) {
      if (body.password.trim().length < 8) {
        throw new HttpError(400, 'New password must be at least 8 characters long.');
      }
      const hash = await hashPassword(body.password.trim());
      assignments.push(`password_hash = ${bind(hash)}`);
      assignments.push(`email_verified_at = now()`);
    }

    if ('jobTitle' in body) assignments.push(`job_title = ${bind(optionalString(body.jobTitle, 200))}`);
    if ('department' in body) assignments.push(`department = ${bind(optionalString(body.department, 200))}`);
    if ('targetClients' in body) assignments.push(`target_clients = ${bind(toNumber(body.targetClients, 0))}`);
    if ('targetDeals' in body) assignments.push(`target_deals = ${bind(toNumber(body.targetDeals, 0))}`);
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

    if (action === 'invite-user') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || !isValidEmail(email)) {
        throw new HttpError(400, 'Enter a valid corporate email address.');
      }

      const displayName = optionalString(body.displayName, 120) || email.split('@')[0];
      const jobTitle = optionalString(body.jobTitle, 200) || 'Relationship Manager';
      const department = optionalString(body.department, 200) || 'Konstructum';
      const role = String(body.role || 'user').toLowerCase();
      const isSuper = role === 'superadmin';
      const isAdmin = isSuper || role === 'admin' || toBoolean(body.isAdmin, false);
      const rawPassword = String(body.password || '').trim() || `Konstructum@${Math.floor(1000 + Math.random() * 9000)}`;
      if (rawPassword.length < 8) {
        throw new HttpError(400, 'Initial password must be at least 8 characters.');
      }

      if (toBoolean(body.autoAllowDomain, false)) {
        const domain = email.split('@')[1]?.toLowerCase();
        if (domain) {
          await raw(
            `INSERT INTO allowed_domains (domain, label, is_active, created_by)
             VALUES ($1, $2, TRUE, $3)
             ON CONFLICT (domain) DO UPDATE SET is_active = TRUE`,
            [domain, department || domain, session.email],
          );
          invalidateDomainsCache();
        }
      } else {
        await requireAllowedEmailAsync(email);
      }

      const existing = await rawOne<any>('SELECT id, email FROM users WHERE lower(email) = $1', [email]);
      const passwordHash = await hashPassword(rawPassword);

      let savedUser: any;
      if (existing) {
        savedUser = await rawOne<any>(
          `UPDATE users
              SET password_hash = $1,
                  display_name = $2,
                  title = $2,
                  job_title = $3,
                  department = $4,
                  is_admin = $5,
                  is_superadmin = $6,
                  is_active = TRUE,
                  email_verified_at = COALESCE(email_verified_at, now())
            WHERE id = $7
            RETURNING id, email, display_name, title, job_title, department, is_admin, COALESCE(is_superadmin, false) AS is_superadmin, is_active, email_verified_at, created_at`,
          [passwordHash, displayName, jobTitle, department, isAdmin, isSuper, existing.id],
        );
        invalidateSessionCache(String(existing.id));
      } else {
        savedUser = await rawOne<any>(
          `INSERT INTO users (
             email, password_hash, display_name, title, job_title, department,
             is_admin, is_superadmin, is_active, email_verified_at, join_date
           ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, TRUE, now(), CURRENT_DATE)
           RETURNING id, email, display_name, title, job_title, department, is_admin, COALESCE(is_superadmin, false) AS is_superadmin, is_active, email_verified_at, created_at`,
          [email, passwordHash, displayName, jobTitle, department, isAdmin, isSuper],
        );
      }

      void sendVerificationCode;

      return sendJson(res, 201, {
        user: savedUser,
        temporaryPassword: rawPassword,
        message: `Account for ${displayName} (${email}) provisioned successfully.`,
      });
    }

    if (action === 'add-domain') {
      const rawDomain = String(body.domain || '')
        .trim()
        .toLowerCase()
        .replace(/^@+/, '')
        .replace(/^https?:\/\//, '')
        .split('/')[0];
      if (!rawDomain || !rawDomain.includes('.') || rawDomain.length < 4) {
        throw new HttpError(400, 'Enter a valid domain name (e.g. konstructum.com).');
      }
      const label = optionalString(body.label, 120) || rawDomain.split('.')[0].toUpperCase();
      await raw(
        `INSERT INTO allowed_domains (domain, label, is_active, created_by)
         VALUES ($1, $2, TRUE, $3)
         ON CONFLICT (domain) DO UPDATE SET label = EXCLUDED.label, is_active = TRUE`,
        [rawDomain, label, session.email],
      );
      invalidateDomainsCache();
      const allowedDomains = await getAllowedDomainsList();
      return sendJson(res, 200, {
        allowedDomains,
        message: `Domain @${rawDomain} (${label}) added and enabled.`,
      });
    }

    if (action === 'toggle-domain') {
      const domain = String(body.domain || '').trim().toLowerCase().replace(/^@+/, '');
      const isActive = toBoolean(body.isActive, true);
      if (domain === 'konstructum.com' && !isActive) {
        throw new HttpError(400, 'The primary corporate domain (@konstructum.com) cannot be disabled.');
      }
      await raw(`UPDATE allowed_domains SET is_active = $1 WHERE domain = $2`, [isActive, domain]);
      invalidateDomainsCache();
      const allowedDomains = await getAllowedDomainsList();
      return sendJson(res, 200, {
        allowedDomains,
        message: `Domain @${domain} ${isActive ? 'enabled' : 'disabled'}.`,
      });
    }

    if (action === 'delete-domain') {
      const domain = String(body.domain || '').trim().toLowerCase().replace(/^@+/, '');
      if (domain === 'konstructum.com') {
        throw new HttpError(400, 'The primary corporate domain (@konstructum.com) cannot be deleted.');
      }
      await raw(`DELETE FROM allowed_domains WHERE domain = $1`, [domain]);
      invalidateDomainsCache();
      const allowedDomains = await getAllowedDomainsList();
      return sendJson(res, 200, {
        allowedDomains,
        message: `Domain @${domain} removed.`,
      });
    }

    if (action === 'update-sso-settings') {
      const ssoEnabled = toBoolean(body.ssoEnabled, true) ? 'true' : 'false';
      const portalUrl = optionalString(body.portalUrl, 500) || 'https://intranet.konstructum.com';
      const ssoMode = optionalString(body.ssoMode, 100) || 'trusted_corporate_sso';

      await raw(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ('intranet_sso_enabled', $1, now()),
                ('intranet_portal_url', $2, now()),
                ('intranet_sso_mode', $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [ssoEnabled, portalUrl, ssoMode],
      );

      return sendJson(res, 200, {
        intranetSettings: { ssoEnabled: ssoEnabled === 'true', portalUrl, ssoMode },
        message: 'Group Intranet SSO settings updated successfully.',
      });
    }

    if (action === 'generate-sso-token') {
      const targetUserId = String(body.userId || session.id).trim();
      const targetUser = await rawOne<any>('SELECT id, email FROM users WHERE id = $1', [targetUserId]);
      if (!targetUser) throw new HttpError(404, 'User not found.');
      const ssoToken = await issueSessionToken(String(targetUser.id), String(targetUser.email));
      return sendJson(res, 200, {
        ssoToken,
        email: targetUser.email,
        gemsSsoUrl: `https://konstructum-gems-six.vercel.app/?sso_token=${encodeURIComponent(ssoToken)}`,
        kairosSsoUrl: `https://konstructum-kairos-one.vercel.app/?sso_token=${encodeURIComponent(ssoToken)}`,
      });
    }

    if (action === 'rebuild-lookups') {
      await raw(
        `INSERT INTO companies (company_key, company_name, canonical_name, status)
         SELECT DISTINCT lower(company_name), company_name, company_name, 'Active'
           FROM clients
          WHERE COALESCE(company_name,'') <> ''
         ON CONFLICT (company_key) DO NOTHING`,
      );
      await raw(
        `UPDATE companies co SET contact_count = COALESCE(
            (SELECT count(*) FROM clients c WHERE lower(c.company_name) = co.company_key), 0)`,
      );
      await raw(
        `INSERT INTO job_titles (title)
         SELECT DISTINCT job_title FROM clients WHERE COALESCE(job_title,'') <> ''
         ON CONFLICT (title) DO NOTHING`,
      );
      await raw(
        `INSERT INTO projects (name)
         SELECT DISTINCT project_name FROM clients WHERE COALESCE(project_name,'') <> ''
         ON CONFLICT (name) DO NOTHING`,
      );

      return sendJson(res, 200, { ok: true, message: 'Lookups rebuilt successfully from the global contact registry.' });
    }

    throw new HttpError(400, `Unknown superadmin action: "${action}"`);
  }

  throw new HttpError(405, 'Method not allowed.');
});
