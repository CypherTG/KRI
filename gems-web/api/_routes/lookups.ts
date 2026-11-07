import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, optionalString, HttpError } from '../_lib/http.js';
import { raw } from '../_lib/db.js';

/**
 * GET  /api/lookups         — { companies, projects, jobTitles } for the pickers
 * POST /api/lookups         — seed one of the lookup registries
 */
export default methodGuard(['GET', 'POST'], async (req, res) => {
  await requireSession(req);

  if (req.method === 'GET') {
    const [companies, projects, jobTitles] = await Promise.all([
      raw<any>('SELECT company_name FROM companies WHERE status = $1 ORDER BY lower(company_name) ASC', ['Active']),
      raw<any>('SELECT project_name FROM projects WHERE status = $1 ORDER BY lower(project_name) ASC', ['Active']),
      raw<any>('SELECT job_title_name FROM job_titles WHERE status = $1 ORDER BY lower(job_title_name) ASC', ['Active']),
    ]);
    return sendJson(res, 200, {
      companies: companies.map((row) => String(row.company_name || '')).filter(Boolean),
      projects: projects.map((row) => String(row.project_name || '')).filter(Boolean),
      jobTitles: jobTitles.map((row) => String(row.job_title_name || '')).filter(Boolean),
    });
  }

  const body = await readJson(req);
  const list = String(body.list ?? '').trim().toLowerCase();
  const values = Array.isArray(body.values) ? body.values : [];
  const cleaned = values.map((value) => String(value ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!cleaned.length) throw new HttpError(400, 'No values supplied.');

  const keys = cleaned.map((name) => name.toLowerCase());
  const orders = cleaned.map((_, index) => String(index + 1).padStart(4, '0'));

  if (list === 'projects') {
    await raw(
      `INSERT INTO projects (project_key, project_name, status, sort_order)
       SELECT k, n, 'Active', o
         FROM unnest($1::text[], $2::text[], $3::text[]) AS t(k, n, o)
       ON CONFLICT (project_key) DO NOTHING`,
      [keys, cleaned, orders],
    );
  } else if (list === 'job_titles') {
    await raw(
      `INSERT INTO job_titles (job_title_key, job_title_name, status, sort_order)
       SELECT k, n, 'Active', o
         FROM unnest($1::text[], $2::text[], $3::text[]) AS t(k, n, o)
       ON CONFLICT (job_title_key) DO NOTHING`,
      [keys, cleaned, orders],
    );
  } else {
    throw new HttpError(400, 'Unknown lookup list. Use "projects" or "job_titles".');
  }

  return sendJson(res, 200, { seeded: cleaned.length, list });
});

export { optionalString };
