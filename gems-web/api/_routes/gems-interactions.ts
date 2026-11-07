import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession, requireAdmin } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, HttpError, optionalString, toDateOnly, toTextArray } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { gemsScopeSql, resolveAgencyOrThrow, normalizeGemsAgency } from '../_lib/gemsScope.js';
import { mapGemsInteraction, CATEGORY_POINTS } from '../_lib/gemsMappers.js';

/**
 * Interactions — the core GEMS log.
 *
 *   GET    /api/gems/interactions                — all, scoped to the 8 agencies
 *   GET    /api/gems/interactions?clientId=…     — one stakeholder
 *   GET    /api/gems/interactions?companyKey=…   — one agency
 *   POST   /api/gems/interactions                — log one
 *   PATCH  /api/gems/interactions?id=…           — reclassify (admin)
 *   DELETE /api/gems/interactions?id=…           — remove (admin)
 *
 * A client_id is accepted only if the contact's company resolves to a monitored
 * agency, so an interaction cannot be attached to an out-of-scope contact by
 * passing its id directly.
 */
export default methodGuard(['GET', 'POST', 'PATCH', 'DELETE'], async (req, res) => {
  const user = await requireSession(req);

  if (req.method === 'GET') {
    const clientId = String(req.query.clientId ?? '').trim();
    const companyKey = String(req.query.companyKey ?? '').trim();
    const month = String(req.query.month ?? '').trim();
    const params: any[] = [];
    let where = '1 = 1';

    if (clientId) {
      where += ' AND i.client_id = $1';
      params.push(clientId);
    }
    if (companyKey) {
      where += ` AND i.company_key = $${params.length + 1}`;
      params.push(companyKey.toLowerCase());
    }
    if (month) {
      where += ` AND i.reporting_month = $${params.length + 1}`;
      params.push(month);
    }

    const rows = await raw<any>(
      `SELECT i.* FROM gems_interactions i
        ${clientId || companyKey ? '' : `JOIN clients c ON c.id = i.client_id`}
        WHERE ${where}
        ORDER BY i.logged_at DESC
        LIMIT 500`,
      params,
    );

    // When listing everything, the join above guarantees scope; drop any row
    // whose contact has since been removed or renamed out of scope.
    const visible = clientId || companyKey
      ? rows
      : rows.filter((row) => normalizeGemsAgency(row.company_name || row.company_key || ''));

    return sendJson(res, 200, { interactions: visible.map(mapGemsInteraction) });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const clientId = String(body.clientId ?? body.ClientID ?? '').trim();
    if (!clientId) throw new HttpError(400, 'A stakeholder is required.');

    // Validate the target is actually in GEMS scope before writing anything.
    // The params array is shared with the predicate builder so the placeholders
    // it emits are the ones actually bound.
    const clientParams: any[] = [clientId];
    const clientScope = gemsScopeSql('c', clientParams);
    const client = await rawOne<any>(
      `SELECT c.id, c.first_name, c.last_name, c.company_name
         FROM clients c
        WHERE c.id = $1 AND ${clientScope}`,
      clientParams,
    );
    if (!client) {
      throw new HttpError(400, 'That contact is not in GEMS scope. GEMS covers the monitored agencies only.');
    }

    const agency = resolveAgencyOrThrow(client.company_name);
    const category = String(body.category ?? body.Category ?? 'Pearl');
    if (!CATEGORY_POINTS[category]) {
      throw new HttpError(400, 'Category must be Crown Jewel, Pearl, Coral, or Ruby.');
    }
    const interactionType = String(body.interactionType ?? body.InteractionType ?? 'Meeting');
    if (!['Meeting', 'Call', 'Email', 'Note'].includes(interactionType)) {
      throw new HttpError(400, 'Interaction type must be Meeting, Call, Email, or Note.');
    }

    const companyName = client.company_name || '';
    const requestedStatus = String(body.reviewStatus ?? body.ReviewStatus ?? 'Submitted').trim();
    const initialStatus = ['Submitted', 'Pending Review', 'Validated', 'Rejected'].includes(requestedStatus)
      ? requestedStatus
      : 'Submitted';

    const row = await rawOne<any>(
      `INSERT INTO gems_interactions (
         client_id, client_name, company_key, company_name, agency, business_arm,
         interaction_type, category, final_classification, influence_percent, points,
         notes, justification, review_status, week_start, reporting_month,
         logged_by, logged_by_id, logged_at, target_user, target_user_id,
         kri_classification, executive_involvement_requested,
         executive_monthly_points_at_log, follow_up_required, follow_up_date, scheduled_date
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         $7,$8,$9,$10,$11,
         $12,$13,$14,$15,$16,
         $17,$18,CURRENT_TIMESTAMP,$19,$20,
         $21,$22,
         $23,$24,$25,$26
       ) RETURNING *`,
      [
        client.id,
        `${client.first_name || ''} ${client.last_name || ''}`.trim(),
        companyName.toLowerCase(),
        companyName,
        agency,
        optionalString(body.businessArm ?? body.BusinessArm, 100),
        interactionType,
        category,
        optionalString(body.finalClassification ?? body.FinalClassification, 100),
        body.influencePercent ?? null,
        CATEGORY_POINTS[category],
        optionalString(body.notes ?? body.Notes, 20000),
        optionalString(body.justification ?? body.Justification, 20000),
        initialStatus,
        toDateOnly(body.weekStart ?? body.WeekStart),
        optionalString(body.reportingMonth ?? body.ReportingMonth, 20),
        user.displayName,
        user.id,
        optionalString(body.targetUser ?? body.TargetUser, 200),
        optionalString(body.targetUserId ?? body.TargetUserId, 100),
        optionalString(body.kriClassification ?? body.KRIClassification, 100),
        body.executiveInvolvementRequested === true,
        Number(body.executiveMonthlyPointsAtLog || 0),
        body.followUpRequired === true,
        toDateOnly(body.followUpDate ?? body.FollowUpDate),
        toDateOnly(body.scheduledDate ?? body.ScheduledDate),
      ],
    );

    await raw(
      `INSERT INTO gems_audit_log (entity_type, entity_id, action, field_name, new_value, user_name, user_email, source, details)
       VALUES ('Interaction', $1, 'Created', 'Category', $2, $3, $4, 'GEMS', $5)`,
      [row.id, category, user.displayName, user.email, `Logged ${interactionType} with ${agency}`],
    );

    return sendJson(res, 201, { interaction: mapGemsInteraction(row) });
  }

  const id = String(req.query.id ?? '').trim();
  if (!id) throw new HttpError(400, 'An interaction id is required.');

  if (req.method === 'DELETE') {
    await requireAdmin(req);
    const existing = await rawOne<any>('SELECT * FROM gems_interactions WHERE id = $1', [id]);
    if (!existing) throw new HttpError(404, 'Interaction not found.');
    await raw('DELETE FROM gems_interactions WHERE id = $1', [id]);
    await raw(
      `INSERT INTO gems_audit_log (entity_type, entity_id, action, user_name, user_email, source, details)
       VALUES ('Interaction', $1, 'Deleted', $2, $3, 'GEMS', $4)`,
      [id, user.displayName, user.email, `Removed ${existing.category} interaction`],
    );
    return sendJson(res, 200, { deleted: true });
  }

  // PATCH — reclassification is a review action, so it is admin-only.
  await requireAdmin(req);
  const body = await readJson(req);
  const assignments: string[] = [];
  const values: any[] = [];
  const bind = (value: any) => { values.push(value); return `$${values.length}`; };

  if ('category' in body || 'Category' in body) {
    const category = String(body.category ?? body.Category);
    if (!CATEGORY_POINTS[category]) throw new HttpError(400, 'Category must be Crown Jewel, Pearl, Coral, or Ruby.');
    assignments.push(`category = ${bind(category)}`);
    // Points follow the category, otherwise the score silently disagrees with it.
    assignments.push(`points = ${bind(CATEGORY_POINTS[category])}`);
  }
  if ('finalClassification' in body) {
    assignments.push(`final_classification = ${bind(optionalString(body.finalClassification, 100))}`);
  }
  if ('reviewStatus' in body || 'ReviewStatus' in body) {
    const status = String(body.reviewStatus ?? body.ReviewStatus);
    if (!['Submitted', 'Pending Review', 'Validated', 'Rejected'].includes(status)) {
      throw new HttpError(400, 'Review status must be Submitted, Pending Review, Validated, or Rejected.');
    }
    assignments.push(`review_status = ${bind(status)}`);
  }
  if ('justification' in body) assignments.push(`justification = ${bind(optionalString(body.justification, 20000))}`);
  if ('influencePercent' in body) assignments.push(`influence_percent = ${bind(body.influencePercent)}`);

  if (!assignments.length) throw new HttpError(400, 'Nothing to update.');

  values.push(id);
  const row = await rawOne<any>(
    `UPDATE gems_interactions SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!row) throw new HttpError(404, 'Interaction not found.');

  await raw(
    `INSERT INTO gems_audit_log (entity_type, entity_id, action, field_name, new_value, user_name, user_email, source, details)
     VALUES ('Interaction', $1, $2, 'Classification', $3, $4, $5, 'GEMS', $6)`,
    [
      id,
      'Approved',
      String(body.reviewStatus ?? body.ReviewStatus ?? row.category),
      user.displayName,
      user.email,
      'Reclassified during review',
    ],
  );

  return sendJson(res, 200, { interaction: mapGemsInteraction(row) });
});
