import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, toDateOnly, toBoolean, optionalString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { scopeSql, ownsSql, canSeeEverything, CLIENT_OWNERS, assertClientWritable } from '../_lib/scope.js';
import { mapComm } from '../_lib/mappers.js';

/**
 * GET   /api/communications?clientId=…  — interaction log (scoped)
 * POST  /api/communications            — log an interaction
 * PATCH /api/communications?id=…       — edit an interaction
 * DELETE /api/communications?id=…      — remove an interaction
 */
export default methodGuard(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const params: any[] = [];
    const predicate = scopeSql(user, 'c', CLIENT_OWNERS, 1, params);
    const filters: string[] = [predicate];
    const clientId = String(req.query.clientId ?? '').trim();
    if (clientId) {
      params.push(clientId);
      filters.push(`cm.client_id = $${params.length}`);
    }
    const rows = await raw<any>(
      `SELECT cm.*, COALESCE(u.display_name, cm.logged_by_label) AS logged_by_label
         FROM communications cm
         JOIN clients c ON c.id = cm.client_id
         LEFT JOIN users u ON u.id = cm.logged_by_id
        WHERE ${filters.join(' AND ')}
        ORDER BY cm.communication_date DESC`,
      params,
    );
    return sendJson(res, 200, { comms: rows.map(mapComm) });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const clientId = String(body.clientId ?? body.ClientID ?? body.client_id ?? '').trim();
    if (!clientId) throw new HttpError(400, 'A contact id is required.');
    await assertClientWritable(user, clientId);

    const subject = optionalString(body.subject ?? body.Subject, 500) || 'Interaction';
    const row = await rawOne<any>(
      `INSERT INTO communications (
          client_id, subject, communication_type, notes, communication_date,
          logged_by_id, logged_by_label, follow_up_required, follow_up_date, proposal_submitted
       ) VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz, now()),$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        clientId,
        subject,
        optionalString(body.type ?? body.communicationType ?? body.CommunicationType, 100),
        optionalString(body.notes ?? body.Notes),
        toDateOnly(body.communicationDate ?? body.date),
        user.id,
        String(body.loggedBy ?? '') || user.displayName,
        toBoolean(body.followUpRequired ?? body.FollowUpRequired, false),
        toDateOnly(body.nextFollowUp ?? body.FollowUpDate ?? body.followUpDate),
        toBoolean(body.proposalSubmitted ?? body.ProposalSubmitted, false),
      ],
    );
    return sendJson(res, 201, { comm: mapComm(row) });
  }

  const id = String(req.query.id ?? '').trim();
  if (!id) throw new HttpError(400, 'An interaction id is required.');
  const existing = await rawOne<any>('SELECT * FROM communications WHERE id = $1', [id]);
  if (!existing) throw new HttpError(404, 'Interaction not found.');

  if (req.method === 'DELETE') {
    const writeParams: any[] = [id];
    const owns = ownsSql(user, 'c', CLIENT_OWNERS, 2, writeParams);
    const check = await rawOne<any>(
      `SELECT cm.id FROM communications cm JOIN clients c ON c.id = cm.client_id WHERE cm.id = $1 AND ${owns}`,
      writeParams,
    );
    if (!check) throw new HttpError(403, 'You can only remove interactions on contacts you own.');
    await raw('DELETE FROM communications WHERE id = $1', [id]);
    return sendJson(res, 200, { deleted: true });
  }

  // PATCH
  const writeParams: any[] = [id];
  const owns = ownsSql(user, 'c', CLIENT_OWNERS, 2, writeParams);
  const check = await rawOne<any>(
    `SELECT cm.id FROM communications cm JOIN clients c ON c.id = cm.client_id WHERE cm.id = $1 AND ${owns}`,
    writeParams,
  );
  if (!check) throw new HttpError(403, 'You can only edit interactions on contacts you own.');

  const body = await readJson(req);
  const assignments: string[] = [];
  const values: any[] = [];
  const bind = (value: any) => {
    values.push(value);
    return `$${values.length}`;
  };
  if ('subject' in body || 'Subject' in body) assignments.push(`subject = ${bind(optionalString(body.subject ?? body.Subject, 500))}`);
  if ('type' in body || 'communicationType' in body) assignments.push(`communication_type = ${bind(optionalString(body.type ?? body.communicationType, 100))}`);
  if ('notes' in body || 'Notes' in body) assignments.push(`notes = ${bind(optionalString(body.notes ?? body.Notes))}`);
  if ('followUpRequired' in body) assignments.push(`follow_up_required = ${bind(toBoolean(body.followUpRequired, false))}`);
  if ('nextFollowUp' in body || 'followUpDate' in body) {
    assignments.push(`follow_up_date = ${bind(toDateOnly(body.nextFollowUp ?? body.followUpDate))}`);
  }
  if (assignments.length) {
    values.push(id);
    await raw(`UPDATE communications SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
  }

  const row = await rawOne<any>('SELECT * FROM communications WHERE id = $1', [id]);
  return sendJson(res, 200, { comm: mapComm(row) });
});

export { canSeeEverything };
