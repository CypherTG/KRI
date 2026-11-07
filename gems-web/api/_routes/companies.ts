import { requireSession } from '../_lib/auth.js';
import { methodGuard, sendJson } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { mapCompany } from '../_lib/mappers.js';
import { syncCompanyRegistry } from './clients.js';

/**
 * GET  /api/companies        — canonical company registry
 * POST /api/companies        — upsert a company record
 * GET  /api/company-lookups  — flattened lists for the three lookup pickers
 */
export default methodGuard(['GET', 'POST'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'POST') {
    const name = String(req.body?.companyName ?? '').trim();
    if (!name) return sendJson(res, 200, { skipped: true });
    await syncCompanyRegistry(name);
    const row = await rawOne<any>('SELECT * FROM companies WHERE company_key = $1', [name.toLowerCase()]);
    return sendJson(res, 200, { company: mapCompany(row) });
  }

  // Keep contact_count and latest_activity in step with the clients table.
  await raw(
    `UPDATE companies co SET
        contact_count = COALESCE((SELECT count(*) FROM clients c WHERE lower(c.company_name) = co.company_key), 0),
        latest_activity = COALESCE((SELECT max(c.last_contact_date) FROM clients c WHERE lower(c.company_name) = co.company_key), co.latest_activity)
      WHERE true`,
  );

  const rows = await raw<any>('SELECT * FROM companies ORDER BY lower(company_name) ASC');
  return sendJson(res, 200, { companies: rows.map(mapCompany) });
});
