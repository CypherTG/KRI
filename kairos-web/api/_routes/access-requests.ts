import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, optionalString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { canSeeEverything, assertClientReviewable } from '../_lib/scope.js';
import { mapAccessRequest } from '../_lib/mappers.js';

const SELECT_ONE = `SELECT * FROM contact_access_requests WHERE id = $1`;
const ACCESS_TTL_DAYS = 7;

/**
 * GET  /api/access-requests?scope=mine|owner|client&clientId=…
 * POST /api/access-requests            — request access to a contact
 * POST /api/access-requests?respond=1  — approve / decline (owner or admin)
 */
export default methodGuard(['GET', 'POST'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const scope = String(req.query.scope ?? 'mine').trim().toLowerCase();
    const rows = await raw<any>(
      `SELECT * FROM contact_access_requests
        WHERE ($1 = 'mine'   AND lower(requester_key) = $2)
           OR ($1 = 'owner'  AND (owner_key = lower($3) OR owner_name = $3))
           OR ($1 = 'client' AND client_id = $4)
        ORDER BY requested_at DESC`,
      [scope, user.email.toLowerCase(), user.displayName, String(req.query.clientId ?? '').trim()],
    );
    return sendJson(res, 200, { requests: rows.map(mapAccessRequest), canApprove: canSeeEverything(user) });
  }

  const body = await readJson(req);

  // --- approve / decline -----------------------------------------------------
  if (String(req.query.respond ?? '') === '1') {
    const requestId = String(body.id ?? body.requestId ?? '').trim();
    const status = String(body.status ?? '').trim();
    if (!requestId) throw new HttpError(400, 'A request id is required.');
    if (!['Approved', 'Declined'].includes(status)) throw new HttpError(400, 'Status must be Approved or Declined.');

    const row = await rawOne<any>('SELECT * FROM contact_access_requests WHERE id = $1', [requestId]);
    if (!row) throw new HttpError(404, 'Access request not found.');
    await assertClientReviewable(user, row.client_id);

    const updated = await rawOne<any>(
      `UPDATE contact_access_requests
          SET status = $2, responded_at = now(), response_by = $3
        WHERE id = $1 RETURNING *`,
      [requestId, status, user.displayName],
    );
    return sendJson(res, 200, { request: mapAccessRequest(updated) });
  }

  // --- create a request ------------------------------------------------------
  const clientId = String(body.clientId ?? body.ClientID ?? '').trim();
  if (!clientId) throw new HttpError(400, 'A contact id is required.');

  const client = await rawOne<any>('SELECT * FROM clients WHERE id = $1', [clientId]);
  if (!client) throw new HttpError(404, 'Contact not found.');

  // Admins never need to request access.
  if (canSeeEverything(user)) {
    const existing = await rawOne<any>(
      `SELECT * FROM contact_access_requests
        WHERE client_id = $1 AND lower(requester_key) = $2
        ORDER BY requested_at DESC LIMIT 1`,
      [clientId, user.email.toLowerCase()],
    );
    if (existing) return sendJson(res, 200, { request: mapAccessRequest(existing), alreadyVisible: true });
    throw new HttpError(400, 'Administrators can already open this contact.');
  }

  const existing = await rawOne<any>(
    `SELECT * FROM contact_access_requests
      WHERE client_id = $1 AND lower(requester_key) = $2
        AND status IN ('Pending','Approved')
      ORDER BY requested_at DESC LIMIT 1`,
    [clientId, user.email.toLowerCase()],
  );
  if (existing) return sendJson(res, 200, { request: mapAccessRequest(existing) });

  const ownerLabel = String(client.primary_contact_name || '');
  const created = await rawOne<any>(
    `INSERT INTO contact_access_requests (
        client_id, client_name, company_name, requester_id, requester_key, requester_name,
        requester_email, owner_key, owner_name, status, reason, requested_at, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pending',$10, now(), now() + ($11 || ' days')::interval)
     RETURNING *`,
    [
      clientId,
      `${client.first_name || ''} ${client.last_name || ''}`.trim() || client.company_name || 'Contact',
      String(client.company_name || ''),
      user.id,
      user.email.toLowerCase(),
      user.displayName,
      user.email,
      String(client.primary_contact_id || '').toLowerCase(),
      ownerLabel,
      optionalString(body.reason, 2000) ?? '',
      ACCESS_TTL_DAYS,
    ],
  );

  return sendJson(res, 201, { request: mapAccessRequest(created) });
});
