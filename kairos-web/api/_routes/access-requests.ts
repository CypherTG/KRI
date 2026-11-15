import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, optionalString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { canSeeEverything, assertClientReviewable } from '../_lib/scope.js';
import { mapAccessRequest } from '../_lib/mappers.js';
import { renderKonstructumEmail, sendPlatformEmail } from '../_lib/mailer.js';

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

    if (updated?.requester_email) {
      const isApproved = status === 'Approved';
      const html = renderKonstructumEmail({
        platform: 'KAIROS',
        badgeText: `Access ${status}`,
        badgeColor: isApproved ? 'green' : 'amber',
        headline: `Contact Access Request ${status}: ${updated.client_name}`,
        greeting: `Hello ${updated.requester_name || 'Colleague'},`,
        lead: isApproved
          ? `Your request to view contact details for ${updated.client_name} (${updated.company_name || 'Organisation'}) has been approved by ${user.displayName}. You now have access for ${ACCESS_TTL_DAYS} days.`
          : `Your request to view contact details for ${updated.client_name} (${updated.company_name || 'Organisation'}) was declined by ${user.displayName}.`,
        rows: [
          { label: 'Contact Name', value: String(updated.client_name || '') },
          { label: 'Company', value: String(updated.company_name || '') },
          { label: 'Decision', value: status },
          { label: 'Reviewed By', value: user.displayName },
        ],
        ctaLabel: isApproved ? 'Open Contact in KAIROS' : 'Open KAIROS Dashboard',
        ctaUrl: isApproved
          ? `https://konstructum-kairos-one.vercel.app/clients/${updated.client_id}`
          : 'https://konstructum-kairos-one.vercel.app/dashboard',
      });
      await sendPlatformEmail({
        to: String(updated.requester_email),
        subject: `KAIROS: Contact Access Request ${status} — ${updated.client_name}`,
        text: `Your request to access ${updated.client_name} (${updated.company_name}) was ${status.toLowerCase()} by ${user.displayName}.`,
        html,
      }).catch(() => {});
    }

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
  const contactName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || client.company_name || 'Contact';
  const reasonText = optionalString(body.reason, 2000) ?? '';
  const created = await rawOne<any>(
    `INSERT INTO contact_access_requests (
        client_id, client_name, company_name, requester_id, requester_key, requester_name,
        requester_email, owner_key, owner_name, status, reason, requested_at, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pending',$10, now(), now() + ($11 || ' days')::interval)
     RETURNING *`,
    [
      clientId,
      contactName,
      String(client.company_name || ''),
      user.id,
      user.email.toLowerCase(),
      user.displayName,
      user.email,
      String(client.primary_contact_id || '').toLowerCase(),
      ownerLabel,
      reasonText,
      ACCESS_TTL_DAYS,
    ],
  );

  // Notify the contact owner (and fallback to admins if owner email is not directly resolved)
  const ownerRow = await rawOne<any>(
    `SELECT email, display_name FROM users
      WHERE is_active = TRUE
        AND (lower(email) = lower($1) OR lower(display_name) = lower($2))
      LIMIT 1`,
    [String(client.primary_contact_id || ''), ownerLabel],
  ).catch(() => null);

  if (ownerRow?.email) {
    const html = renderKonstructumEmail({
      platform: 'KAIROS',
      badgeText: 'Access Request Pending',
      badgeColor: 'blue',
      headline: `Colleague Contact Access Request: ${contactName}`,
      greeting: `Hello ${ownerRow.display_name || ownerLabel || 'Team Member'},`,
      lead: `${user.displayName} (${user.email}) has requested ${ACCESS_TTL_DAYS}-day read access to your contact ${contactName} at ${client.company_name || 'Organisation'}.`,
      rows: [
        { label: 'Contact Requested', value: contactName },
        { label: 'Organisation', value: String(client.company_name || '') },
        { label: 'Requested By', value: `${user.displayName} (${user.email})` },
        { label: 'Access Duration', value: `${ACCESS_TTL_DAYS} days upon approval` },
      ],
      notesTitle: 'Reason for Request',
      notesBody: reasonText || 'Standard collaboration request.',
      ctaLabel: 'Review & Approve in KAIROS',
      ctaUrl: `https://konstructum-kairos-one.vercel.app/clients/${clientId}`,
    });
    await sendPlatformEmail({
      to: String(ownerRow.email),
      subject: `KAIROS: ${user.displayName} requested access to ${contactName}`,
      text: `${user.displayName} requested access to your contact ${contactName} (${client.company_name}).`,
      html,
    }).catch(() => {});
  }

  return sendJson(res, 201, { request: mapAccessRequest(created) });
});
