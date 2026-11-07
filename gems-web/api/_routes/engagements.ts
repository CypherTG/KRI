import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, toDateOnly, toNumber, optionalString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { scopeSql, ownsSql, canSeeEverything, CLIENT_OWNERS, assertEngagementWritable, assertClientWritable } from '../_lib/scope.js';
import { mapEngagement } from '../_lib/mappers.js';
import { resolveUserId } from './clients.js';

const SELECT_ONE = `
  SELECT e.*, c.first_name || ' ' || c.last_name AS client_name
    FROM engagements e
    JOIN clients c ON c.id = e.client_id
   WHERE e.id = $1
`;

const VALID_STATUSES = ['Draft', 'Submitted', 'Under Review', 'Won', 'Lost', 'On Hold'];

/**
 * GET    /api/engagements?clientId=… — pipeline (scoped to visible contacts)
 * POST   /api/engagements             — create a deal
 * PATCH  /api/engagements?id=…        — update a deal
 * DELETE /api/engagements?id=…        — delete a deal
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
      filters.push(`e.client_id = $${params.length}`);
    }
    const rows = await raw<any>(
      `SELECT e.*, c.first_name || ' ' || c.last_name AS client_name
         FROM engagements e
         JOIN clients c ON c.id = e.client_id
        WHERE ${filters.join(' AND ')}
        ORDER BY e.created_at DESC`,
      params,
    );
    return sendJson(res, 200, { engagements: rows.map(mapEngagement) });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const clientId = String(body.clientId ?? body.ClientID ?? body.client_id ?? '').trim();
    if (!clientId) throw new HttpError(400, 'A contact is required before a deal can be created.');
    await assertClientWritable(user, clientId);

    const status = String(body.stage ?? body.status ?? body.Stage ?? 'Draft');
    if (!VALID_STATUSES.includes(status)) {
      throw new HttpError(400, `Status must be one of: ${VALID_STATUSES.join(', ')}.`);
    }

    let ownedById = user.id;
    let ownedByLabel = user.displayName;
    if (canSeeEverything(user)) {
      const requested = resolveUserId(body.ownedBy ?? body.OwnedBy ?? body.ownedById);
      if (requested) {
        const owner = await rawOne<any>('SELECT display_name, title FROM users WHERE id = $1', [requested]);
        if (owner) {
          ownedById = requested;
          ownedByLabel = String(owner.display_name || owner.title || '');
        }
      }
    }

    const row = await rawOne<any>(
      `INSERT INTO engagements (
          client_id, title, engagement_type, status, submitted_date,
          estimated_value, actual_value, expected_close_date, closed_date,
          owned_by_id, owned_by_label, notes, start_date
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::date, CURRENT_DATE))
       RETURNING id`,
      [
        clientId,
        optionalString(body.title ?? body.Title, 500) || 'New engagement',
        optionalString(body.engagementType ?? body.EngagementType, 100),
        status,
        toDateOnly(body.submittedDate ?? body.SubmittedDate),
        toNumber(body.estimatedValue ?? body.EstimatedValue, 0),
        toNumber(body.actualValue ?? body.ActualValue, 0),
        toDateOnly(body.expectedCloseDate ?? body.ExpectedCloseDate),
        status === 'Won' || status === 'Lost' ? toDateOnly(body.closedDate) || new Date().toISOString().slice(0, 10) : toDateOnly(body.closedDate),
        ownedById,
        ownedByLabel,
        optionalString(body.notes ?? body.Notes),
        toDateOnly(body.startDate ?? body.StartDate),
      ],
    );

    const created = await rawOne<any>(SELECT_ONE, [row.id]);
    return sendJson(res, 201, { engagement: mapEngagement(created) });
  }

  const id = String(req.query.id ?? '').trim();
  if (!id) throw new HttpError(400, 'A deal id is required.');
  const existing = await rawOne<any>('SELECT * FROM engagements WHERE id = $1', [id]);
  if (!existing) throw new HttpError(404, 'Deal not found.');

  if (req.method === 'DELETE') {
    await assertEngagementWritable(user, id);
    await raw('DELETE FROM engagements WHERE id = $1', [id]);
    return sendJson(res, 200, { deleted: true });
  }

  await assertEngagementWritable(user, id);
  const body = await readJson(req);

  const assignments: string[] = [];
  const values: any[] = [];
  const bind = (value: any) => {
    values.push(value);
    return `$${values.length}`;
  };

  const status = body.stage ?? body.status ?? body.Stage ?? body.Status;
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(String(status))) {
      throw new HttpError(400, `Status must be one of: ${VALID_STATUSES.join(', ')}.`);
    }
    assignments.push(`status = ${bind(String(status))}`);
    if (String(status) === 'Won' || String(status) === 'Lost') {
      assignments.push(`closed_date = ${bind(toDateOnly(body.closedDate) || new Date().toISOString().slice(0, 10))}`);
    }
  }
  if ('title' in body || 'Title' in body) assignments.push(`title = ${bind(optionalString(body.title ?? body.Title, 500))}`);
  if ('notes' in body || 'Notes' in body) assignments.push(`notes = ${bind(optionalString(body.notes ?? body.Notes))}`);
  if ('estimatedValue' in body || 'EstimatedValue' in body) {
    assignments.push(`estimated_value = ${bind(toNumber(body.estimatedValue ?? body.EstimatedValue, 0))}`);
  }
  if ('actualValue' in body || 'ActualValue' in body) {
    assignments.push(`actual_value = ${bind(toNumber(body.actualValue ?? body.ActualValue, 0))}`);
  }
  if ('expectedCloseDate' in body || 'ExpectedCloseDate' in body) {
    assignments.push(`expected_close_date = ${bind(toDateOnly(body.expectedCloseDate ?? body.ExpectedCloseDate))}`);
  }
  if (canSeeEverything(user) && ('ownedBy' in body || 'OwnedBy' in body || 'ownedById' in body)) {
    const requested = resolveUserId(body.ownedBy ?? body.OwnedBy ?? body.ownedById);
    if (requested) {
      const owner = await rawOne<any>('SELECT display_name, title FROM users WHERE id = $1', [requested]);
      assignments.push(`owned_by_id = ${bind(requested)}`);
      assignments.push(`owned_by_label = ${bind(String(owner?.display_name || owner?.title || ''))}`);
    }
  }

  if (assignments.length) {
    values.push(id);
    await raw(`UPDATE engagements SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
  }

  const row = await rawOne<any>(SELECT_ONE, [id]);
  return sendJson(res, 200, { engagement: mapEngagement(row) });
});
