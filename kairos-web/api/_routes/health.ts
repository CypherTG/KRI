import { methodGuard, sendJson } from '../_lib/http.js';
import { rawOne } from '../_lib/db.js';
import { listRoutes } from '../_routes.js';

/**
 * GET /api/health — deployment diagnostics.
 *
 * Reports which configuration is present and whether the database actually
 * answers, without ever echoing a secret value. Safe to leave enabled: it
 * reveals only booleans and row counts, and the router has no auth on it
 * precisely so you can see a broken deployment without signing in.
 */
export default methodGuard(['GET'], async (_req, res) => {
  const required = ['DATABASE_URL', 'SESSION_SECRET', 'GEMINI_API_KEY', 'BLOB_READ_WRITE_TOKEN'] as const;
  const optional = ['ADMIN_EMAILS', 'PERMISSIONS_MODE', 'GEMINI_MODEL'] as const;

  const config: Record<string, boolean> = {};
  for (const key of required) config[key] = Boolean(process.env[key]);
  for (const key of optional) config[key] = Boolean(process.env[key]);

  const missingRequired = required.filter((key) => !config[key]);

  let database: { connected: boolean; error?: string; counts?: Record<string, number> } = { connected: false };

  if (config.DATABASE_URL) {
    try {
      const row = await rawOne<any>('SELECT 1 AS ok');
      const tables = [
        'users', 'clients', 'communications', 'engagements', 'automations',
        'stage_history', 'companies', 'projects', 'job_titles',
        'company_acumen', 'biodata', 'contact_access_requests',
      ];
      const counts: Record<string, number> = {};
      for (const table of tables) {
        try {
          const result = await rawOne<any>(`SELECT count(*)::int AS total FROM ${table}`);
          counts[table] = Number(result?.total || 0);
        } catch {
          counts[table] = -1; // table missing
        }
      }
      database = { connected: Number(row?.ok) === 1, counts };
    } catch (error) {
      database = { connected: false, error: error instanceof Error ? error.message : String(error) };
    }
  } else {
    database = { connected: false, error: 'DATABASE_URL is not set.' };
  }

  const ready = missingRequired.length === 0 && database.connected;

  return sendJson(res, ready ? 200 : 503, {
    status: ready ? 'ready' : 'not-ready',
    missingRequired,
    config,
    database,
    apiRoutes: listRoutes().map((route) => ({ path: route.path, description: route.description })),
    node: process.version,
  });
});
