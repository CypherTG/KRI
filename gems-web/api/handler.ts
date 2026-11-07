import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * The one and only deployed serverless function.
 *
 * Three constraints shaped this file.
 *
 * 1. Vercel's Hobby plan allows at most 12 serverless functions per deployment
 *    and KAIROS exposes 19 endpoints, so the handlers live in `_routes/`
 *    (underscore-prefixed, therefore not deployed) and are dispatched by path
 *    from here. One function, one cold start, whole API.
 *
 * 2. The file is deliberately NOT named `[...path].ts`. On a Vite project
 *    Vercel only matched the bracket catch-all for single-segment API paths
 *    (`/api/clients` reached it, `/api/auth/session` fell through to a CDN
 *    404). A plain filename plus the `/api/:path*` rewrite in vercel.json is
 *    unambiguous and works for any number of path segments.
 *
 * 3. This file imports nothing at module scope, not even a value import. A
 *    static import evaluates the whole dependency graph — 19 handlers, four
 *    libraries and five npm packages — *before* the handler function exists, so
 *    any throw in that graph becomes an opaque FUNCTION_INVOCATION_FAILED that
 *    no try/catch here can see. Both imports below are dynamic, which keeps
 *    module evaluation inside the try and turns an uncatchable cold-start crash
 *    into a reportable error with a real message and stack.
 *
 * `import type` is erased at compile time and creates no runtime dependency.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { dispatch } = await import('./_routes.js');
    return await dispatch(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    console.error('[kairos] API function failed', {
      url: req?.url,
      method: req?.method,
      message,
      stack: stack?.split('\n').slice(0, 8).join('\n'),
    });

    if (res.writableEnded) return undefined;

    // Deliberately not using sendError(): it lives in the dependency graph that
    // just failed to load, so depending on it here could mask the real error.
    res.status(500);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ error: message, source: 'kairos-handler' });
  }
}
