import { requireSession } from '../_lib/auth.js';
import { methodGuard, sendJson } from '../_lib/http.js';
import { raw, rawOne } from '../_lib/db.js';
import { gemsScopeSql, GEMS_ALLOWED_AGENCIES, normalizeGemsAgency } from '../_lib/gemsScope.js';
import { mapClient, CLIENT_PERSON_COLUMNS, CLIENT_JOINS } from '../_lib/mappers.js';
import { mapGemsInteraction, mapGemsCompliance } from '../_lib/gemsMappers.js';

/**
 * GEMS operational summary and notifications (Global Scope).
 *
 *   GET /api/gems/summary
 *   GET /api/gems/stakeholders
 *   GET /api/gems/agencies
 *   GET /api/gems/notifications
 *
 * Reads the shared `clients` table that KAIROS uses globally so every contact
 * submitted in KAIROS is immediately available in GEMS.
 */
export default methodGuard(['GET'], async (req, res) => {
  const user = await requireSession(req);
  const path = String(req.url || '');

  // ── Stakeholders: the shared global contact registry ──
  if (path.includes('/stakeholders')) {
    const params: any[] = [];
    const rows = await raw<any>(
      `SELECT c.*, ${CLIENT_PERSON_COLUMNS}
         FROM clients c
         ${CLIENT_JOINS}
        WHERE ${gemsScopeSql('c', params)}
        ORDER BY c.date_registered DESC NULLS LAST, c.id DESC`,
      params,
    );
    return sendJson(res, 200, {
      stakeholders: rows.map(mapClient),
      agencies: GEMS_ALLOWED_AGENCIES,
      scope: 'Global (all KAIROS contacts & agencies)',
    });
  }

  // ── Agencies & Organisations: group all contacts by resolved agency / company ──
  if (path.includes('/agencies')) {
    const params: any[] = [];
    const rows = await raw<any>(
      `SELECT c.*, ${CLIENT_PERSON_COLUMNS}
         FROM clients c
         ${CLIENT_JOINS}
        WHERE ${gemsScopeSql('c', params)}
        ORDER BY c.company_name NULLS LAST`,
      params,
    );

    const byAgency = new Map<string, { name: string; clients: any[] }>();
    // Seed the 8 priority regulators first so they always appear even if 0 contacts
    for (const reg of GEMS_ALLOWED_AGENCIES) {
      byAgency.set(reg.toLowerCase(), { name: reg, clients: [] });
    }

    for (const row of rows) {
      const resolved = normalizeGemsAgency(row.company_name || '') || String(row.company_name || '').trim() || 'Unassigned';
      const key = resolved.toLowerCase();
      if (!byAgency.has(key)) {
        byAgency.set(key, { name: resolved, clients: [] });
      }
      byAgency.get(key)!.clients.push(mapClient(row));
    }

    const agencies = Array.from(byAgency.entries())
      .map(([key, entry]) => {
        const { name, clients } = entry;
        return {
          key,
          name,
          totalContacts: clients.length,
          knowledge: clients.filter((c) => c.KRIStage === 'Knowledge').length,
          rapport: clients.filter((c) => c.KRIStage === 'Rapport').length,
          intimacy: clients.filter((c) => c.KRIStage === 'Intimacy').length,
          clients,
        };
      })
      .sort((a, b) => b.totalContacts - a.totalContacts || a.name.localeCompare(b.name));

    return sendJson(res, 200, { agencies, totalAgencies: agencies.length });
  }

  // ── Notifications: what the signed-in user needs to act on ──
  if (path.includes('/notifications')) {
    const openActions = await raw<any>(
      `SELECT * FROM gems_actions
        WHERE status IN ('Open','InProgress')
          AND (assigned_to_id = $1 OR assigned_to_id IS NULL)
        ORDER BY coalesce(due_date, '9999-12-31') ASC
        LIMIT 25`,
      [user.id],
    );

    const expiring = await raw<any>(
      `SELECT * FROM gems_compliance
        WHERE status = 'Expired'
           OR (expiry_date IS NOT NULL
               AND expiry_date <= CURRENT_DATE + INTERVAL '60 days')
        ORDER BY coalesce(expiry_date, '9999-12-31') ASC
        LIMIT 25`,
    );

    return sendJson(res, 200, {
      notifications: [
        ...openActions.map((row) => ({
          id: `action:${row.id}`,
          type: 'Action',
          title: row.entity_name || row.description || 'Open action',
          detail: `${row.action_type} · ${row.priority}`,
          dueDate: row.due_date,
          entityType: row.entity_type,
          entityId: row.entity_id,
        })),
        ...expiring.map((row) => ({
          id: `compliance:${row.id}`,
          type: 'Compliance',
          title: `${row.compliance_type} — ${row.entity_name}`,
          detail: row.status === 'Expired' ? 'Expired' : 'Expiring soon',
          dueDate: row.expiry_date,
          entityType: row.entity_type,
          entityId: row.entity_id,
        })),
      ],
    });
  }

  // ── Summary: the numbers the dashboard opens on ──
  const agencyParams: any[] = [];
  const scope = gemsScopeSql('c', agencyParams);

  const agencyGroupParams: any[] = [];
  const agencyGroupScope = gemsScopeSql('c', agencyGroupParams);

  const [
    stakeholderCount,
    interactionRows,
    pendingReview,
    complianceRows,
    actionRows,
    agencies,
  ] = await Promise.all([
    rawOne<any>(`SELECT count(*)::int AS total FROM clients c WHERE ${scope}`, agencyParams),
    raw<any>(
      `SELECT i.* FROM gems_interactions i
        ORDER BY i.logged_at DESC
        LIMIT 500`,
    ),
    rawOne<any>(
      `SELECT count(*)::int AS total FROM gems_interactions WHERE review_status IN ('Submitted','Pending Review')`,
    ),
    raw<any>(
      `SELECT * FROM gems_compliance ORDER BY coalesce(expiry_date, '9999-12-31') ASC NULLS LAST LIMIT 500`,
    ),
    raw<any>(
      `SELECT * FROM gems_actions ORDER BY created_at DESC LIMIT 500`,
    ),
    raw<any>(
      `SELECT lower(coalesce(c.company_name,'')) AS company, count(*)::int AS n
         FROM clients c WHERE ${agencyGroupScope}
        GROUP BY 1 ORDER BY n DESC`,
      agencyGroupParams,
    ),
  ]);

  const byCategory = interactionRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + 1;
    return acc;
  }, {});

  const pointsByCategory = interactionRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] || 0) + Number(row.points || 0);
    return acc;
  }, {});

  const byType = interactionRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.interaction_type] = (acc[row.interaction_type] || 0) + 1;
    return acc;
  }, {});

  const months = new Map<string, { count: number; points: number }>();
  for (const row of interactionRows) {
    const month = row.reporting_month || new Date(row.logged_at).toISOString().slice(0, 7);
    const entry = months.get(month) || { count: 0, points: 0 };
    entry.count += 1;
    entry.points += Number(row.points || 0);
    months.set(month, entry);
  }

  const complianceByStatus = complianceRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86400000);
  const day = (value: unknown) => (value ? new Date(String(value)) : null);
  const expiredCompliance = complianceRows.filter((row) => {
    const expiry = day(row.expiry_date);
    return row.status === 'Expired' || (expiry && expiry < now);
  }).length;
  const expiringSoonCompliance = complianceRows.filter((row) => {
    const expiry = day(row.expiry_date);
    return expiry && expiry >= now && expiry <= soon;
  }).length;
  const activeCompliance = complianceRows.filter((row) => {
    const expiry = day(row.expiry_date);
    return row.status === 'Active' && (!expiry || expiry > soon);
  }).length;

  const openActionRows = actionRows.filter((row) => row.status === 'Open' || row.status === 'InProgress');
  const dueDateOf = (row: any) => (row.due_date ? new Date(String(row.due_date)) : null);
  const overdueActions = openActionRows.filter((row) => {
    const due = dueDateOf(row);
    return due && due < now;
  }).length;
  const dueSoonActions = openActionRows.filter((row) => {
    const due = dueDateOf(row);
    return due && due >= now && due <= soon;
  }).length;
  const completedActions = actionRows.filter((row) => row.status === 'Completed').length;

  return sendJson(res, 200, {
    totalStakeholders: stakeholderCount?.total || 0,
    totalInteractions: interactionRows.length,
    totalPoints: interactionRows.reduce((sum, row) => sum + Number(row.points || 0), 0),
    pendingReview: pendingReview?.total || 0,
    openActions: openActionRows.length,
    complianceRecords: complianceRows.length,
    totalCompliance: complianceRows.length,
    activeCompliance,
    expiredCompliance,
    expiringSoonCompliance,
    pendingActions: actionRows.filter((row) => row.status === 'Open').length,
    overdueActions,
    dueSoonActions,
    completedActions,
    byCategory,
    pointsByCategory,
    byType,
    complianceByStatus,
    months: Array.from(months.entries())
      .map(([month, value]) => ({ month, ...value }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    agencies: agencies.map((row) => ({
      key: row.company,
      name: normalizeGemsAgency(row.company) || row.company,
      totalContacts: row.n,
    })),
    recentInteractions: interactionRows.slice(0, 20).map(mapGemsInteraction),
    recentCompliance: complianceRows.slice(0, 20).map(mapGemsCompliance),
    scope: 'Global (all KAIROS contacts & agencies)',
  });
});
