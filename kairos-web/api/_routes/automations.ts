import { requireSession } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, toDateOnly, toBoolean, optionalString, HttpError } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { scopeSql, ownsSql, canSeeEverything, CLIENT_OWNERS, assertClientWritable } from '../_lib/scope.js';
import { mapAutomation } from '../_lib/mappers.js';
import { resolveUserId } from './clients.js';

const SELECT_ONE = `
  SELECT a.*, c.first_name || ' ' || c.last_name AS client_name, u.display_name AS assigned_to_name
    FROM automations a
    JOIN clients c ON c.id = a.client_id
    LEFT JOIN users u ON u.id = a.assigned_to_id
   WHERE a.id = $1
`;

const VALID_TYPES = ['Birthday Message', 'Holiday Greeting', 'Follow-Up Reminder', 'Seasonal Card'];

/**
 * GET    /api/automations        — rules for visible contacts
 * POST   /api/automations        — create a rule
 * PATCH  /api/automations?id=…   — update / toggle a rule
 * DELETE /api/automations?id=…   — delete a rule
 */
export default methodGuard(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const params: any[] = [];
    const predicate = scopeSql(user, 'c', CLIENT_OWNERS, 1, params);
    const rows = await raw<any>(
      `SELECT a.*, c.first_name || ' ' || c.last_name AS client_name, u.display_name AS assigned_to_name
         FROM automations a
         JOIN clients c ON c.id = a.client_id
         LEFT JOIN users u ON u.id = a.assigned_to_id
        WHERE ${predicate}
        ORDER BY a.created_at DESC`,
      params,
    );
    return sendJson(res, 200, { automations: rows.map(mapAutomation) });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const clientId = String(body.clientId ?? body.ClientID ?? '').trim();
    if (!clientId) throw new HttpError(400, 'A contact is required for an automation rule.');
    await assertClientWritable(user, clientId);

    const type = String(body.automationType ?? body.AutomationType ?? 'Follow-Up Reminder');
    if (!VALID_TYPES.includes(type)) {
      throw new HttpError(400, `Automation type must be one of: ${VALID_TYPES.join(', ')}.`);
    }

    const assignedTo = canSeeEverything(user) ? resolveUserId(body.assignedTo ?? body.AssignedTo) : null;

    const row = await rawOne<any>(
      `INSERT INTO automations (
          client_id, title, automation_type, trigger_date, is_recurring,
          is_enabled, message_template, last_sent_date, assigned_to_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        clientId,
        optionalString(body.title ?? body.Title, 300) || type,
        type,
        toDateOnly(body.triggerDate ?? body.TriggerDate),
        toBoolean(body.isRecurring ?? body.IsRecurring, false),
        toBoolean(body.isEnabled ?? body.IsEnabled, true),
        optionalString(body.messageTemplate ?? body.MessageTemplate),
        toDateOnly(body.lastSentDate ?? body.LastSentDate),
        assignedTo,
      ],
    );

    const created = await rawOne<any>(SELECT_ONE, [row.id]);
    return sendJson(res, 201, { automation: mapAutomation(created) });
  }

  const id = String(req.query.id ?? '').trim();
  if (!id) throw new HttpError(400, 'A rule id is required.');
  const existing = await rawOne<any>('SELECT * FROM automations WHERE id = $1', [id]);
  if (!existing) throw new HttpError(404, 'Rule not found.');

  const writeParams: any[] = [id];
  const owns = ownsSql(user, 'c', CLIENT_OWNERS, 2, writeParams);
  const allowed = await rawOne<any>(
    `SELECT a.id FROM automations a JOIN clients c ON c.id = a.client_id WHERE a.id = $1 AND ${owns}`,
    writeParams,
  );
  if (!allowed) throw new HttpError(403, 'You can only change rules on contacts you own.');

  if (req.method === 'DELETE') {
    await raw('DELETE FROM automations WHERE id = $1', [id]);
    return sendJson(res, 200, { deleted: true });
  }

  const body = await readJson(req);
  const assignments: string[] = [];
  const values: any[] = [];
  const bind = (value: any) => {
    values.push(value);
    return `$${values.length}`;
  };

  const type = body.automationType ?? body.AutomationType;
  if (type !== undefined) {
    if (!VALID_TYPES.includes(String(type))) throw new HttpError(400, `Automation type must be one of: ${VALID_TYPES.join(', ')}.`);
    assignments.push(`automation_type = ${bind(String(type))}`);
  }
  if ('title' in body || 'Title' in body) assignments.push(`title = ${bind(optionalString(body.title ?? body.Title, 300))}`);
  if ('triggerDate' in body || 'TriggerDate' in body) assignments.push(`trigger_date = ${bind(toDateOnly(body.triggerDate ?? body.TriggerDate))}`);
  if ('isRecurring' in body || 'IsRecurring' in body) assignments.push(`is_recurring = ${bind(toBoolean(body.isRecurring ?? body.IsRecurring, false))}`);
  if ('isEnabled' in body || 'IsEnabled' in body) assignments.push(`is_enabled = ${bind(toBoolean(body.isEnabled ?? body.IsEnabled, true))}`);
  if ('messageTemplate' in body || 'MessageTemplate' in body) assignments.push(`message_template = ${bind(optionalString(body.messageTemplate ?? body.MessageTemplate))}`);
  if ('lastSentDate' in body || 'LastSentDate' in body) assignments.push(`last_sent_date = ${bind(toDateOnly(body.lastSentDate ?? body.LastSentDate))}`);
  if (canSeeEverything(user) && ('assignedTo' in body || 'AssignedTo' in body)) {
    assignments.push(`assigned_to_id = ${bind(resolveUserId(body.assignedTo ?? body.AssignedTo))}`);
  }

  if (assignments.length) {
    values.push(id);
    await raw(`UPDATE automations SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
  }

  const row = await rawOne<any>(SELECT_ONE, [id]);
  return sendJson(res, 200, { automation: mapAutomation(row) });
});
