/**
 * Route table for the single deployed serverless function.
 *
 * The Hobby plan caps a deployment at 12 serverless functions and this app has
 * 18 endpoints, so everything is dispatched from one function
 * (`api/[...path].ts`) rather than being deployed as 18 separate ones. The
 * handlers themselves are unchanged — they were always plain
 * (req, res) functions wrapped in `methodGuard`, so they just need routing.
 *
 * Behaviour is identical to separate functions: same paths, same methods,
 * same status codes, same bodies.
 *
 * Note: a single function also means a single cold start, which is a genuine
 * win here — one warm instance serves the whole API.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import registerHandler from './_routes/auth/register.js';
import loginHandler from './_routes/auth/login.js';
import sessionHandler from './_routes/auth/session.js';
import resendCodeHandler, { signInProbeHandler, verifyHandler } from './_routes/auth/verification.js';
import clientsHandler from './_routes/clients.js';
import clientHandler from './_routes/client.js';
import communicationsHandler from './_routes/communications.js';
import engagementsHandler from './_routes/engagements.js';
import automationsHandler from './_routes/automations.js';
import stageHistoryHandler from './_routes/stage-history.js';
import usersHandler from './_routes/users.js';
import biodataHandler from './_routes/biodata.js';
import biodataPhotoHandler from './_routes/biodata-photo.js';
import accessRequestsHandler from './_routes/access-requests.js';
import acumenHandler from './_routes/acumen.js';
import companiesHandler from './_routes/companies.js';
import lookupsHandler from './_routes/lookups.js';
import importHandler from './_routes/import.js';
import airosHandler from './_routes/airos.js';
import healthHandler from './_routes/health.js';
import profilePhotoHandler from './_routes/profile-photo.js';

import { sendError } from './_lib/http.js';
import { HttpError } from './_lib/db.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

interface Route {
  /** Path relative to /api, e.g. '/clients'. */
  path: string;
  handler: Handler;
  description: string;
}

const ROUTES: Route[] = [
  { path: '/auth/register', handler: registerHandler, description: 'Create an account' },
  { path: '/auth/login', handler: loginHandler, description: 'Exchange credentials for a session' },
  { path: '/auth/session', handler: sessionHandler, description: 'Resolve or clear the current session' },
  { path: '/auth/resend-code', handler: resendCodeHandler, description: 'Email another verification code' },
  { path: '/auth/sign-in', handler: signInProbeHandler, description: 'Does this address need a code?' },
  { path: '/auth/verify', handler: verifyHandler, description: 'Redeem a verification code' },

  { path: '/clients', handler: clientsHandler, description: 'List / create contacts' },
  { path: '/client', handler: clientHandler, description: 'Read / update / delete one contact' },
  { path: '/communications', handler: communicationsHandler, description: 'Interaction log' },
  { path: '/engagements', handler: engagementsHandler, description: 'Pipeline deals' },
  { path: '/automations', handler: automationsHandler, description: 'Automation rules' },
  { path: '/stage-history', handler: stageHistoryHandler, description: 'Stage change audit trail' },
  { path: '/biodata', handler: biodataHandler, description: 'Extended contact profile' },
  { path: '/biodata-photo', handler: biodataPhotoHandler, description: 'Contact photo upload / removal' },
  { path: '/access-requests', handler: accessRequestsHandler, description: 'Contact access requests' },
  { path: '/acumen', handler: acumenHandler, description: 'Company documents' },
  { path: '/companies', handler: companiesHandler, description: 'Company registry' },
  { path: '/lookups', handler: lookupsHandler, description: 'Job title / project lookups' },
  { path: '/users', handler: usersHandler, description: 'People registry and admin controls' },
  { path: '/import', handler: importHandler, description: 'Excel / CSV contact import' },
  { path: '/airos', handler: airosHandler, description: 'AIROS assistant (Gemini proxy)' },
  { path: '/health', handler: healthHandler, description: 'Deployment diagnostics (unauthenticated)' },
  { path: '/profile-photo', handler: profilePhotoHandler, description: 'Upload / remove your own profile photo' },
];

const BY_PATH = new Map(ROUTES.map((route) => [route.path, route]));

/** Normalises /api/clients/ and /api/clients to /clients. */
function normalisePath(url: string | undefined): string {
  const raw = String(url || '');
  const withoutQuery = raw.split('?')[0];
  const withoutApi = withoutQuery.replace(/^\/?api(?=\/|$)/i, '');
  const trimmed = withoutApi.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? `/${trimmed.toLowerCase()}` : '/';
}

export function listRoutes(): Route[] {
  return ROUTES;
}

export async function dispatch(req: VercelRequest, res: VercelResponse): Promise<unknown> {
  const path = normalisePath(req.url);

  const route = BY_PATH.get(path);
  if (!route) {
    return sendError(
      res,
      new HttpError(404, `No API route matches ${req.method || 'GET'} ${path}.`),
    );
  }

  // Each handler runs its own methodGuard, so verbs are validated there.
  return route.handler(req, res);
}

export type { Route, Handler };
