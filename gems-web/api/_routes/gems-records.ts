import { requireSession, requireAdmin } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, HttpError, optionalString, toDateOnly } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { mapGemsCompliance, mapGemsAction, mapGemsAudit } from '../_lib/gemsMappers.js';
import { storeFile, removeFile, blobEnabled, BlobUnavailableError } from '../_lib/blob.js';

/**
 * Compliance records — permits, licences, obligations, filings.
 *
 *   GET    /api/gems/compliance?entityType=&entityId=
 *   POST   /api/gems/compliance
 *   PATCH  /api/gems/compliance?id=
 *   DELETE /api/gems/compliance?id=
 */
async function complianceHandler(req: any, res: any) {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const entityType = String(req.query.entityType ?? '').trim();
    const entityId = String(req.query.entityId ?? '').trim();
    const params: any[] = [];
    let where = '1 = 1';
    if (entityType) { where += ` AND entity_type = $${params.length + 1}`; params.push(entityType); }
    if (entityId) { where += ` AND entity_id = $${params.length + 1}`; params.push(entityId); }

    const rows = await raw<any>(
      `SELECT * FROM gems_compliance WHERE ${where} ORDER BY coalesce(expiry_date, '9999-12-31') ASC NULLS LAST LIMIT 500`,
      params,
    );
    return sendJson(res, 200, { records: rows.map(mapGemsCompliance) });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const rawEntityType = String(body.entityType || 'Agency').trim();
    const entityType = ['Stakeholder', 'Agency'].includes(rawEntityType) ? rawEntityType : 'Agency';
    const entityName = optionalString(body.entityName ?? body.title ?? body.Title, 300)
      || optionalString(body.governingBody, 200)
      || 'General Compliance';
    const entityId = String(body.entityId || body.governingBody || entityName).trim();
    const complianceType = String(body.complianceType || 'Permit');
    if (!['Permit', 'License', 'Obligation', 'Certificate', 'Filing', 'Registration'].includes(complianceType)) {
      throw new HttpError(400, 'Compliance type must be Permit, License, Obligation, Certificate, Filing, or Registration.');
    }
    const status = String(body.status || 'Active');
    if (!['Active', 'Expired', 'Pending', 'Cancelled', 'ExpiringSoon', 'UnderReview'].includes(status)) {
      throw new HttpError(400, 'Status must be Active, Expired, Pending, Cancelled, ExpiringSoon, or UnderReview.');
    }

    const row = await rawOne<any>(
      `INSERT INTO gems_compliance (
         entity_type, entity_id, entity_name, compliance_type, status, issue_date,
         expiry_date, renewal_date, governing_body, reference_number, description,
         notes, assigned_to, assigned_to_id, last_checked_date
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        entityType, entityId, entityName, complianceType, status,
        toDateOnly(body.issueDate), toDateOnly(body.expiryDate), toDateOnly(body.renewalDate),
        optionalString(body.governingBody, 200), optionalString(body.referenceNumber, 200),
        optionalString(body.description, 20000), optionalString(body.notes, 20000),
        optionalString(body.assignedTo, 200), optionalString(body.assignedToId, 100),
        toDateOnly(body.lastCheckedDate),
      ],
    );

    await raw(
      `INSERT INTO gems_audit_log (entity_type, entity_id, action, field_name, new_value, user_name, user_email, source, details)
       VALUES ('Compliance', $1, 'Created', 'ComplianceType', $2, $3, $4, 'GEMS', $5)`,
      [row.id, complianceType, user.displayName, user.email, `${complianceType} recorded`],
    );
    return sendJson(res, 201, { record: mapGemsCompliance(row) });
  }

  const id = String(req.query.id ?? '').trim();
  if (!id) throw new HttpError(400, 'A record id is required.');

  if (req.method === 'DELETE') {
    await requireAdmin(req);
    const existing = await rawOne<any>('SELECT * FROM gems_compliance WHERE id = $1', [id]);
    if (!existing) throw new HttpError(404, 'Record not found.');
    await raw('DELETE FROM gems_compliance WHERE id = $1', [id]);
    if (existing.document_blob_path) await removeFile(existing.document_blob_path);
    await raw(
      `INSERT INTO gems_audit_log (entity_type, entity_id, action, user_name, user_email, source, details)
       VALUES ('Compliance', $1, 'Deleted', $2, $3, 'GEMS', 'Record removed')`,
      [id, user.displayName, user.email],
    );
    return sendJson(res, 200, { deleted: true });
  }

  const body = await readJson(req);
  const assignments: string[] = [];
  const values: any[] = [];
  const bind = (value: any) => { values.push(value); return `$${values.length}`; };

  if ('status' in body) {
    const status = String(body.status);
    if (!['Active', 'Expired', 'Pending', 'Cancelled', 'ExpiringSoon', 'UnderReview'].includes(status)) {
      throw new HttpError(400, 'Unknown status.');
    }
    assignments.push(`status = ${bind(status)}`);
  }
  if ('issueDate' in body) assignments.push(`issue_date = ${bind(toDateOnly(body.issueDate))}`);
  if ('expiryDate' in body) assignments.push(`expiry_date = ${bind(toDateOnly(body.expiryDate))}`);
  if ('renewalDate' in body) assignments.push(`renewal_date = ${bind(toDateOnly(body.renewalDate))}`);
  if ('notes' in body) assignments.push(`notes = ${bind(optionalString(body.notes, 20000))}`);
  if ('description' in body) assignments.push(`description = ${bind(optionalString(body.description, 20000))}`);
  if ('assignedTo' in body) assignments.push(`assigned_to = ${bind(optionalString(body.assignedTo, 200))}`);
  if ('lastCheckedDate' in body) assignments.push(`last_checked_date = ${bind(toDateOnly(body.lastCheckedDate))}`);
  if ('alertSent' in body) assignments.push(`alert_sent = ${bind(body.alertSent === true)}`);

  if (!assignments.length) throw new HttpError(400, 'Nothing to update.');

  values.push(id);
  const row = await rawOne<any>(
    `UPDATE gems_compliance SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!row) throw new HttpError(404, 'Record not found.');

  await raw(
    `INSERT INTO gems_audit_log (entity_type, entity_id, action, user_name, user_email, source, details)
     VALUES ('Compliance', $1, 'Updated', $2, $3, 'GEMS', $4)`,
    [id, user.displayName, user.email, assignments.join(', ').replace(/=\s*\$\d+/g, '').trim()],
  );
  return sendJson(res, 200, { record: mapGemsCompliance(row) });
}

/**
 * Actions — follow-ups and tasks.
 *
 *   GET    /api/gems/actions?entityType=&entityId=
 *   POST   /api/gems/actions
 *   PATCH  /api/gems/actions?id=
 *   DELETE /api/gems/actions?id=
 */
async function actionsHandler(req: any, res: any) {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const entityType = String(req.query.entityType ?? '').trim();
    const entityId = String(req.query.entityId ?? '').trim();
    const openOnly = req.query.open === '1' || req.query.open === 'true';
    const params: any[] = [];
    let where = '1 = 1';
    if (entityType) { where += ` AND entity_type = $${params.length + 1}`; params.push(entityType); }
    if (entityId) { where += ` AND entity_id = $${params.length + 1}`; params.push(entityId); }
    if (openOnly) where += ` AND status IN ('Open','InProgress')`;

    const rows = await raw<any>(
      `SELECT * FROM gems_actions WHERE ${where}
        ORDER BY coalesce(due_date, '9999-12-31') ASC NULLS LAST, created_at DESC LIMIT 500`,
      params,
    );
    return sendJson(res, 200, { records: rows.map(mapGemsAction) });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const rawEntityType = String(body.entityType || 'System').trim();
    const entityType = ['Stakeholder', 'Agency', 'Interaction', 'Compliance', 'System'].includes(rawEntityType)
      ? rawEntityType
      : 'System';
    const actionType = String(body.actionType || 'Task');
    if (!['FollowUp', 'Task', 'Reminder', 'Approval', 'Review', 'Notification'].includes(actionType)) {
      throw new HttpError(400, 'Unknown action type.');
    }
    const priority = String(body.priority || 'Medium');
    if (!['High', 'Medium', 'Low'].includes(priority)) throw new HttpError(400, 'Priority must be High, Medium, or Low.');

    const entityName = optionalString(body.entityName ?? body.title ?? body.Title, 300)
      || optionalString(body.description, 200);

    const row = await rawOne<any>(
      `INSERT INTO gems_actions (
         entity_type, entity_id, entity_name, action_type, priority, status,
         due_date, assigned_to, assigned_to_id, description, source, source_id, created_by, created_by_id
       ) VALUES ($1,$2,$3,$4,$5,'Open',$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        entityType, String(body.entityId ?? '').trim(), entityName,
        actionType, priority, toDateOnly(body.dueDate),
        optionalString(body.assignedTo, 200), optionalString(body.assignedToId, 100),
        optionalString(body.description, 20000), optionalString(body.source, 100),
        optionalString(body.sourceId, 200), user.displayName, user.id,
      ],
    );

    await raw(
      `INSERT INTO gems_audit_log (entity_type, entity_id, action, field_name, new_value, user_name, user_email, source, details)
       VALUES ($1, $2, 'Created', 'ActionType', $3, $4, $5, 'GEMS', $6)`,
      [entityType, row.entity_id, actionType, user.displayName, user.email, optionalString(body.description, 200) || `${actionType} created`],
    );
    return sendJson(res, 201, { record: mapGemsAction(row) });
  }

  const id = String(req.query.id ?? '').trim();
  if (!id) throw new HttpError(400, 'An action id is required.');

  if (req.method === 'DELETE') {
    await requireAdmin(req);
    const existing = await rawOne<any>('SELECT * FROM gems_actions WHERE id = $1', [id]);
    if (!existing) throw new HttpError(404, 'Action not found.');
    await raw('DELETE FROM gems_actions WHERE id = $1', [id]);
    return sendJson(res, 200, { deleted: true });
  }

  const body = await readJson(req);
  const assignments: string[] = [];
  const values: any[] = [];
  const bind = (value: any) => { values.push(value); return `$${values.length}`; };

  if ('status' in body) {
    const status = String(body.status);
    if (!['Open', 'InProgress', 'Completed', 'Cancelled', 'Deferred'].includes(status)) {
      throw new HttpError(400, 'Unknown status.');
    }
    assignments.push(`status = ${bind(status)}`);
    // Completing stamps the date, so the pipeline never shows a done item with no
    // completion date.
    if (status === 'Completed') assignments.push(`completed_date = ${bind(new Date().toISOString().slice(0, 10))}`);
  }
  if ('priority' in body) assignments.push(`priority = ${bind(String(body.priority))}`);
  if ('dueDate' in body) assignments.push(`due_date = ${bind(toDateOnly(body.dueDate))}`);
  if ('description' in body) assignments.push(`description = ${bind(optionalString(body.description, 20000))}`);
  if ('outcome' in body) assignments.push(`outcome = ${bind(optionalString(body.outcome, 20000))}`);
  if ('assignedTo' in body) assignments.push(`assigned_to = ${bind(optionalString(body.assignedTo, 200))}`);

  if (!assignments.length) throw new HttpError(400, 'Nothing to update.');

  values.push(id);
  const row = await rawOne<any>(
    `UPDATE gems_actions SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!row) throw new HttpError(404, 'Action not found.');

  await raw(
    `INSERT INTO gems_audit_log (entity_type, entity_id, action, user_name, user_email, source, details)
     VALUES ('Action', $1, $2, $3, $4, 'GEMS', 'Action updated')`,
    [id, 'Updated', user.displayName, user.email],
  );
  return sendJson(res, 200, { record: mapGemsAction(row) });
}

/**
 * Audit trail.
 *
 *   GET    /api/gems/audit?entityType=&entityId=
 *   POST   /api/gems/audit
 *
 * Append-only. There is no update or delete route, deliberately: an audit log
 * that can be edited is not an audit log.
 */
async function auditHandler(req: any, res: any) {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const entityType = String(req.query.entityType ?? '').trim();
    const entityId = String(req.query.entityId ?? '').trim();
    const params: any[] = [];
    let where = '1 = 1';
    if (entityType) { where += ` AND entity_type = $${params.length + 1}`; params.push(entityType); }
    if (entityId) { where += ` AND entity_id = $${params.length + 1}`; params.push(entityId); }

    const rows = await raw<any>(
      `SELECT * FROM gems_audit_log WHERE ${where} ORDER BY timestamp DESC LIMIT 500`,
      params,
    );
    return sendJson(res, 200, { records: rows.map(mapGemsAudit) });
  }

  const body = await readJson(req);
  const action = String(body.action ?? 'Viewed');
  if (!['Created', 'Updated', 'Deleted', 'Viewed', 'Exported', 'Approved', 'Rejected'].includes(action)) {
    throw new HttpError(400, 'Unknown audit action.');
  }
  const row = await rawOne<any>(
    `INSERT INTO gems_audit_log (entity_type, entity_id, action, field_name, old_value, new_value, user_name, user_email, source, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      String(body.entityType ?? 'System'), String(body.entityId ?? '').trim(), action,
      optionalString(body.fieldName, 200), optionalString(body.oldValue, 20000),
      optionalString(body.newValue, 20000), user.displayName, user.email,
      optionalString(body.source, 100) || 'GEMS', optionalString(body.details, 20000),
    ],
  );
  return sendJson(res, 201, { record: mapGemsAudit(row) });
}

/**
 * Compliance document upload.
 *
 *   POST   /api/gems/compliance/document   { id, fileName, contentType, base64 }
 *   DELETE /api/gems/compliance/document?id=…&recordId=…
 */
async function complianceDocumentHandler(req: any, res: any) {
  const user = await requireSession(req);

  if (req.method === 'DELETE') {
    const recordId = String(req.query.recordId ?? '').trim();
    const existing = await rawOne<any>('SELECT * FROM gems_compliance WHERE id = $1', [recordId]);
    if (!existing) throw new HttpError(404, 'Record not found.');
    if (existing.document_blob_path) {
      await removeFile(existing.document_blob_path);
      await rawOne(
        'UPDATE gems_compliance SET documents_json = NULL, document_blob_path = NULL WHERE id = $1 RETURNING id',
        [recordId],
      );
    }
    return sendJson(res, 200, { removed: true });
  }

  const body = await readJson(req);
  const recordId = String(body.id ?? '').trim();
  if (!recordId) throw new HttpError(400, 'A record id is required.');

  const existing = await rawOne<any>('SELECT * FROM gems_compliance WHERE id = $1', [recordId]);
  if (!existing) throw new HttpError(404, 'Record not found.');

  const contentType = String(body.contentType ?? '').split(';')[0].trim().toLowerCase();
  const buffer = Buffer.from(String(body.base64 ?? ''), 'base64');
  if (!buffer.length) throw new HttpError(400, 'The file contents were empty.');
  if (buffer.length > 8 * 1024 * 1024) throw new HttpError(400, 'That file is larger than 8 MB.');
  if (!blobEnabled()) throw new BlobUnavailableError();

  const safeName = String(body.fileName ?? 'document')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 100) || 'document';

  // Namespaced under gems/ so GEMS files can never collide with KAIROS ones in
  // the shared Blob store.
  const stored = await storeFile(`gems/compliance/${recordId}/${Date.now()}-${safeName}`, buffer, contentType);

  const documents = [{
    name: safeName,
    url: stored.url,
    size: stored.size,
    uploadedAt: new Date().toISOString(),
    uploadedBy: user.email,
  }];

  const row = await rawOne<any>(
    `UPDATE gems_compliance
        SET documents_json = $2, document_blob_path = $3
      WHERE id = $1 RETURNING *`,
    [recordId, JSON.stringify(documents), stored.pathname],
  );

  await raw(
    `INSERT INTO gems_audit_log (entity_type, entity_id, action, field_name, new_value, user_name, user_email, source, details)
     VALUES ('Compliance', $1, 'Updated', 'Document', $2, $3, $4, 'GEMS', 'Document uploaded')`,
    [recordId, safeName, user.displayName, user.email],
  );

  return sendJson(res, 200, { record: mapGemsCompliance(row), url: stored.url });
}

const COMPLIANCE = methodGuard(['GET', 'POST', 'PATCH', 'DELETE'], complianceHandler);
const ACTIONS = methodGuard(['GET', 'POST', 'PATCH', 'DELETE'], actionsHandler);
const AUDIT = methodGuard(['GET', 'POST'], auditHandler);
const DOCUMENT = methodGuard(['POST', 'DELETE'], complianceDocumentHandler);

export { COMPLIANCE as gemsComplianceHandler, ACTIONS as gemsActionsHandler, AUDIT as gemsAuditHandler, DOCUMENT as gemsComplianceDocumentHandler };
