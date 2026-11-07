import { requireSession } from '../_lib/auth.js';
import { methodGuard, sendJson } from '../_lib/http.js';
import { raw } from '../_lib/db.js';
import { scopeSql, canSeeEverything, CLIENT_OWNERS } from '../_lib/scope.js';
import { mapStageChange } from '../_lib/mappers.js';

/**
 * GET  /api/stage-history?clientId=… — the K→R→I audit trail.
 * GET  /api/stage-history?recent=1     — the latest changes for the leaderboard.
 */
export default methodGuard(['GET'], async (req, res) => {
  const user = await requireSession(req);

  const params: any[] = [];
  const predicate = scopeSql(user, 'c', CLIENT_OWNERS, 1, params);
  const filters: string[] = [predicate];

  const clientId = String(req.query.clientId ?? '').trim();
  if (clientId) {
    params.push(clientId);
    filters.push(`sh.client_id = $${params.length}`);
  }
  if (String(req.query.recent ?? '') === '1') {
    params.push(400);
    filters.push(`sh.changed_date > now() - ($${params.length} || ' days')::interval`);
  }

  const rows = await raw<any>(
    `SELECT sh.*, COALESCE(u.display_name, sh.changed_by_label) AS changed_by_label
       FROM stage_history sh
       JOIN clients c ON c.id = sh.client_id
       LEFT JOIN users u ON u.id = sh.changed_by_id
      WHERE ${filters.join(' AND ')}
      ORDER BY sh.changed_date DESC
      LIMIT 2000`,
    params,
  );

  return sendJson(res, 200, { stageHistory: rows.map(mapStageChange), canSeeAll: canSeeEverything(user) });
});
