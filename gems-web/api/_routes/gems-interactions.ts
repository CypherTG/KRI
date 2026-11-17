import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSession, requireAdmin } from '../_lib/auth.js';
import { methodGuard, readJson, sendJson, HttpError, optionalString, toDateOnly } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { gemsScopeSql, resolveAgencyOrThrow, normalizeGemsAgency } from '../_lib/gemsScope.js';
import { mapGemsInteraction, CATEGORY_POINTS } from '../_lib/gemsMappers.js';
import {
  sendGemsReviewNotificationEmail,
  sendPlatformEmail,
  renderKonstructumEmail,
} from '../_lib/mailer.js';

/**
 * Ensures a follow-up action item exists in `gems_actions` whenever an interaction
 * has `follow_up_required = true` or a `follow_up_date`. Idempotent per interaction id.
 */
async function ensureFollowUpActionForInteraction(
  interactionRow: any,
  actorName: string,
  actorId: string | number,
): Promise<boolean> {
  const hasFollowUp = Boolean(interactionRow.follow_up_required || interactionRow.follow_up_date);
  if (!hasFollowUp) return false;

  const existingAction = await rawOne<any>(
    `SELECT id FROM gems_actions WHERE source = 'Interaction' AND source_id = $1 LIMIT 1`,
    [String(interactionRow.id)],
  );
  if (existingAction) {
    if (interactionRow.follow_up_date) {
      await raw(
        `UPDATE gems_actions SET due_date = COALESCE(due_date, $2) WHERE id = $1`,
        [existingAction.id, interactionRow.follow_up_date],
      );
    }
    return false;
  }

  const dueStr = interactionRow.follow_up_date
    ? new Date(interactionRow.follow_up_date).toISOString().slice(0, 10)
    : null;
  const daysUntilDue = dueStr
    ? Math.round((new Date(dueStr).getTime() - Date.now()) / 86400000)
    : 14;
  const priority = daysUntilDue <= 7 ? 'High' : 'Medium';
  const assignedTo = interactionRow.target_user || interactionRow.logged_by || actorName;
  const assignedToId = String(interactionRow.target_user_id || interactionRow.logged_by_id || actorId || '');
  const stakeholderLabel = `${interactionRow.client_name || 'Stakeholder'} (${interactionRow.agency || interactionRow.company_name || 'Agency'})`;
  const finalClass = interactionRow.final_classification || interactionRow.category || 'Ruby';
  const description = `Follow-up on ${interactionRow.interaction_type || 'Interaction'} (${finalClass}): ${interactionRow.notes || interactionRow.justification || 'Scheduled follow-up'}`.slice(0, 4000);

  await rawOne<any>(
    `INSERT INTO gems_actions (
       entity_type, entity_id, entity_name, action_type, priority, status,
       due_date, assigned_to, assigned_to_id, description, source, source_id, created_by, created_by_id
     ) VALUES (
       'Stakeholder', $1, $2, 'FollowUp', $3, 'Open',
       $4, $5, $6, $7, 'Interaction', $8, $9, $10
     ) RETURNING id`,
    [
      String(interactionRow.client_id || ''),
      stakeholderLabel,
      priority,
      dueStr,
      assignedTo,
      assignedToId,
      description,
      String(interactionRow.id),
      actorName,
      String(actorId || ''),
    ],
  );

  return true;
}

/**
 * Resolves the email address for the employee credited or who logged the interaction.
 */
async function resolveInteractionEmployeeEmail(interactionRow: any, fallbackEmail: string): Promise<{ email: string; name: string }> {
  const candidateIds = [interactionRow.target_user_id, interactionRow.logged_by_id]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  if (candidateIds.length > 0) {
    const byId = await rawOne<any>(
      `SELECT email, display_name FROM users WHERE id = ANY($1::text[]) AND is_active = TRUE LIMIT 1`,
      [candidateIds],
    ).catch(() => null);
    if (byId?.email) {
      return { email: String(byId.email), name: String(byId.display_name || interactionRow.target_user || interactionRow.logged_by || '') };
    }
  }

  const candidateNames = [interactionRow.target_user, interactionRow.logged_by]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  for (const name of candidateNames) {
    const byName = await rawOne<any>(
      `SELECT email, display_name FROM users
        WHERE is_active = TRUE
          AND (lower(display_name) = lower($1) OR lower(email) = lower($1) OR lower(display_name) LIKE '%' || lower($1) || '%')
        LIMIT 1`,
      [name],
    );
    if (byName?.email) {
      return { email: String(byName.email), name: String(byName.display_name || name) };
    }
  }

  return {
    email: fallbackEmail,
    name: String(interactionRow.target_user || interactionRow.logged_by || 'Team Member'),
  };
}

/**
 * Interactions — the core GEMS log.
 *
 *   GET    /api/gems/interactions                — all, scoped to the 8 agencies
 *   GET    /api/gems/interactions?clientId=…     — one stakeholder
 *   GET    /api/gems/interactions?companyKey=…   — one agency
 *   POST   /api/gems/interactions                — log one
 *   PATCH  /api/gems/interactions?id=…           — accept / reclassify (admin)
 *   DELETE /api/gems/interactions?id=…           — remove (admin)
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
        WHERE ${where}
        ORDER BY i.logged_at DESC
        LIMIT 500`,
      params,
    );

    return sendJson(res, 200, { interactions: rows.map(mapGemsInteraction) });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const clientId = String(body.clientId ?? body.ClientID ?? '').trim();
    if (!clientId) throw new HttpError(400, 'A stakeholder is required.');

    const clientParams: any[] = [clientId];
    const clientScope = gemsScopeSql('c', clientParams);
    const client = await rawOne<any>(
      `SELECT c.id, c.first_name, c.last_name, c.company_name
         FROM clients c
        WHERE c.id = $1 AND ${clientScope}`,
      clientParams,
    );
    if (!client) {
      throw new HttpError(404, 'Stakeholder contact not found in registry.');
    }

    const requestedAgency = optionalString(body.agency ?? body.Agency, 200);
    const agency = normalizeGemsAgency(requestedAgency || client.company_name) || resolveAgencyOrThrow(client.company_name);
    const category = String(body.category ?? body.Category ?? 'Pearl');
    if (!CATEGORY_POINTS[category]) {
      throw new HttpError(400, 'Category must be Crown Jewel, Pearl, Coral, or Ruby.');
    }
    const interactionType = String(body.interactionType ?? body.InteractionType ?? 'Physical Meeting');
    if (!['Physical Meeting', 'Virtual Meeting', 'Email', 'Meeting', 'Call', 'Note'].includes(interactionType)) {
      throw new HttpError(400, 'Interaction type must be Physical Meeting, Virtual Meeting, or Email.');
    }

    const companyName = client.company_name || '';
    const requestedStatus = String(body.reviewStatus ?? body.ReviewStatus ?? 'Submitted').trim();
    const initialStatus = ['Submitted', 'Pending Review', 'Validated', 'Rejected'].includes(requestedStatus)
      ? requestedStatus
      : 'Submitted';

    const repMonth = optionalString(body.reportingMonth ?? body.ReportingMonth, 20) || '';
    const compPointsRow = await rawOne<{ pts: number }>(
      `SELECT COALESCE(SUM(points), 0)::int AS pts
         FROM gems_interactions
        WHERE lower(coalesce(company_key, company_name, '')) = lower($1)
          AND ($2 = '' OR reporting_month = $2)`,
      [companyName, repMonth],
    ).catch(() => ({ pts: 0 }));
    const companyMonthlyPoints = (compPointsRow?.pts ?? 0) + CATEGORY_POINTS[category];
    const allowExecSupport = body.executiveInvolvementRequested === true && companyMonthlyPoints >= 20;

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
        repMonth || null,
        user.displayName,
        user.id,
        optionalString(body.targetUser ?? body.TargetUser, 200),
        optionalString(body.targetUserId ?? body.TargetUserId, 100),
        optionalString(body.kriClassification ?? body.KRIClassification, 100),
        allowExecSupport,
        companyMonthlyPoints,
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

    // Auto-create a linked Follow-Up Action if follow-up is required or has a date
    await ensureFollowUpActionForInteraction(row, user.displayName, user.id).catch((err) => {
      console.error('[gems] Failed to auto-create follow-up action on POST', err);
    });

    // If Executive Management Involvement was requested, create an Approval action and notify Admins
    if (row.executive_involvement_requested) {
      await rawOne(
        `INSERT INTO gems_actions (
           entity_type, entity_id, entity_name, action_type, priority, status,
           due_date, assigned_to, description, source, source_id, created_by, created_by_id
         ) VALUES (
           'Stakeholder', $1, $2, 'Approval', 'High', 'Open',
           CURRENT_DATE + INTERVAL '3 days', 'Executive Management', $3, 'Interaction', $4, $5, $6
         ) RETURNING id`,
        [
          String(row.client_id),
          `${row.client_name} (${agency})`,
          `Executive management involvement requested by ${user.displayName} (${row.executive_monthly_points_at_log || 0} monthly pts accumulated): ${row.notes || ''}`.slice(0, 4000),
          String(row.id),
          user.displayName,
          String(user.id),
        ],
      ).catch(() => {});

      const admins = await raw<any>(`SELECT email FROM users WHERE is_admin = TRUE AND is_active = TRUE`).catch(() => []);
      const adminEmails = admins.map((a) => String(a.email || '')).filter(Boolean);
      if (adminEmails.length > 0) {
        const html = renderKonstructumEmail({
          platform: 'GEMS',
          badgeText: 'Executive Involvement Requested',
          badgeColor: 'purple',
          headline: `Executive Management Involvement: ${row.client_name} (${agency})`,
          lead: `${user.displayName} has requested Executive Management involvement to advance the stakeholder relationship with ${row.client_name} at ${companyName}.`,
          rows: [
            { label: 'Stakeholder', value: row.client_name },
            { label: 'Agency', value: `${agency} (${companyName})` },
            { label: 'Entity', value: row.business_arm || 'KCC' },
            { label: 'Proposed Category', value: `${category} (${CATEGORY_POINTS[category]} pts)` },
            { label: 'Company Monthly Points', value: `${row.executive_monthly_points_at_log || 0} / 20 pts qualification threshold` },
            { label: 'Requested By', value: user.displayName },
          ],
          notesTitle: 'Meeting Notes & Qualification Justification',
          notesBody: row.notes || '',
          ctaLabel: 'Review in GEMS',
          ctaUrl: 'https://konstructum-gems-six.vercel.app/gems/review',
        });
        await sendPlatformEmail({
          to: adminEmails,
          subject: `GEMS Executive Involvement Request — ${row.client_name} (${agency})`,
          text: `${user.displayName} requested Executive Management involvement for ${row.client_name} (${agency}).`,
          html,
        }).catch(() => {});
      }
    }

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

  // PATCH — accepting or reclassifying is an Admin-only review action.
  await requireAdmin(req);
  const existing = await rawOne<any>('SELECT * FROM gems_interactions WHERE id = $1', [id]);
  if (!existing) throw new HttpError(404, 'Interaction not found.');

  const body = await readJson(req);
  const assignments: string[] = [];
  const values: any[] = [];
  const bind = (value: any) => { values.push(value); return `$${values.length}`; };

  if ('category' in body || 'Category' in body) {
    const category = String(body.category ?? body.Category);
    if (!CATEGORY_POINTS[category]) throw new HttpError(400, 'Category must be Crown Jewel, Pearl, Coral, or Ruby.');
    assignments.push(`category = ${bind(category)}`);
    assignments.push(`points = ${bind(CATEGORY_POINTS[category])}`);
  }
  if ('finalClassification' in body) {
    const finalCat = optionalString(body.finalClassification, 100);
    assignments.push(`final_classification = ${bind(finalCat)}`);
    // Ensure points match finalClassification if category wasn't explicitly passed
    if (!('category' in body) && !('Category' in body) && finalCat && CATEGORY_POINTS[finalCat]) {
      assignments.push(`category = ${bind(finalCat)}`);
      assignments.push(`points = ${bind(CATEGORY_POINTS[finalCat])}`);
    }
  }
  if ('reviewStatus' in body || 'ReviewStatus' in body) {
    const status = String(body.reviewStatus ?? body.ReviewStatus);
    if (!['Submitted', 'Pending Review', 'Validated', 'Rejected'].includes(status)) {
      throw new HttpError(400, 'Review status must be Submitted, Pending Review, Validated, or Rejected.');
    }
    assignments.push(`review_status = ${bind(status)}`);
  }
  if ('justification' in body) assignments.push(`justification = ${bind(optionalString(body.justification, 20000))}`);
  if ('adminComment' in body || 'admin_comment' in body || 'comment' in body) {
    assignments.push(`admin_comment = ${bind(optionalString(body.adminComment ?? body.admin_comment ?? body.comment, 10000))}`);
  }
  if ('influencePercent' in body) assignments.push(`influence_percent = ${bind(body.influencePercent)}`);

  if (!assignments.length) throw new HttpError(400, 'Nothing to update.');

  values.push(id);
  const row = await rawOne<any>(
    `UPDATE gems_interactions SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!row) throw new HttpError(404, 'Interaction not found.');

  // 1. Ensure a linked Follow-Up Action exists in `gems_actions` if follow-up is set
  const followUpActionCreated = await ensureFollowUpActionForInteraction(row, user.displayName, user.id).catch(() => false);

  // 2. Resolve employee email and send branded notification email (+ .ics calendar attachment if follow-up exists)
  const recipient = await resolveInteractionEmployeeEmail(row, user.email);
  const finalCategory = String(row.final_classification || row.category || 'Ruby');
  const previousCategory = String(existing.category || finalCategory);
  const isValidated = row.review_status === 'Validated';
  const decision: 'Accepted' | 'Reclassified' =
    isValidated && finalCategory === previousCategory ? 'Accepted' : 'Reclassified';

  // Calculate employee's monthly points total for the reporting month
  const monthSumRow = await rawOne<{ total: number }>(
    `SELECT COALESCE(SUM(points), 0)::int AS total
       FROM gems_interactions
      WHERE reporting_month = $1
        AND (lower(target_user) = lower($2) OR lower(logged_by) = lower($2))`,
    [row.reporting_month || '', recipient.name || row.target_user || row.logged_by || ''],
  ).catch(() => ({ total: Number(row.points || 0) }));

  const followUpDateStr = row.follow_up_date
    ? new Date(row.follow_up_date).toISOString().slice(0, 10)
    : '';

  const mailResult = await sendGemsReviewNotificationEmail({
    to: recipient.email,
    employeeName: recipient.name,
    stakeholderName: String(row.client_name || 'Stakeholder'),
    companyName: String(row.company_name || ''),
    agency: String(row.agency || ''),
    businessArm: String(row.business_arm || 'KCC'),
    interactionType: String(row.interaction_type || 'Meeting'),
    decision,
    previousCategory,
    finalCategory,
    pointsAwarded: Number(row.points || CATEGORY_POINTS[finalCategory] || 1),
    monthlyPointsTotal: monthSumRow?.total ?? Number(row.points || 0),
    notes: String(row.notes || row.justification || ''),
    adminComment: String(row.admin_comment || ''),
    reviewedBy: user.displayName,
    followUpRequired: Boolean(row.follow_up_required),
    followUpDate: followUpDateStr,
    interactionId: String(row.id),
  }).catch((err) => {
    console.error('[gems] Review notification email error', err);
    return { sent: false, transport: 'console' as const };
  });

  await raw(
    `INSERT INTO gems_audit_log (entity_type, entity_id, action, field_name, old_value, new_value, user_name, user_email, source, details)
     VALUES ('Interaction', $1, $2, 'Classification', $3, $4, $5, $6, 'GEMS', $7)`,
    [
      id,
      decision === 'Accepted' ? 'Approved' : 'Rejected',
      previousCategory,
      `${finalCategory} (${row.review_status})`,
      user.displayName,
      user.email,
      `${decision} as ${finalCategory} (${row.points} pts). Email to ${recipient.email}: ${mailResult.sent ? 'sent' : 'queued'} (${mailResult.transport})${followUpDateStr ? ` · Follow-up: ${followUpDateStr}` : ''}${row.admin_comment ? ` · Admin Feedback: ${row.admin_comment}` : ''}`,
    ],
  );

  return sendJson(res, 200, {
    interaction: mapGemsInteraction(row),
    notificationSent: mailResult.sent,
    recipientEmail: recipient.email,
    followUpActionCreated,
  });
});
