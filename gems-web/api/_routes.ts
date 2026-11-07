/**
 * Route table for the single deployed serverless function.
 *
 * The Hobby plan caps a deployment at 12 serverless functions, so everything is
 * dispatched from one function (`api/handler.ts`) rather than deployed as
 * separate ones. One function also means one cold start for the whole API.
 *
 * GEMS differs from KAIROS in two ways that matter here:
 *
 *  · Its endpoints are namespaced under `/api/gems/*`, so the table supports
 *    prefix matching for that branch and exact matching for everything else.
 *  · Stakeholders and agencies are NOT listed from `/api/clients`. GEMS reads the
 *    same contact registry as KAIROS, but restricted to the eight monitored
 *    agencies, and that restriction is applied in SQL (see `api/_lib/gemsScope`).
 *    Deliberately omitting `/api/clients` means there is no unfiltered route in
 *    this app for the browser to fall back to.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import registerHandler from './_routes/auth/register.js';
import loginHandler from './_routes/auth/login.js';
import sessionHandler from './_routes/auth/session.js';
import resendCodeHandler, { signInProbeHandler, verifyHandler } from './_routes/auth/verification.js';
import profilePhotoHandler from './_routes/profile-photo.js';
import healthHandler from './_routes/health.js';
import userHandler from './_routes/users.js';
import companyHandler from './_routes/companies.js';
import lookupHandler from './_routes/lookups.js';
import clientsHandler from './_routes/clients.js';
import clientHandler from './_routes/client.js';
import communicationsHandler from './_routes/communications.js';
import engagementsHandler from './_routes/engagements.js';
import automationsHandler from './_routes/automations.js';
import stageHistoryHandler from './_routes/stage-history.js';
import biodataHandler from './_routes/biodata.js';
import biodataPhotoHandler from './_routes/biodata-photo.js';
import accessRequestsHandler from './_routes/access-requests.js';
import acumenHandler from './_routes/acumen.js';

import gemsInteractionsHandler from './_routes/gems-interactions.js';
import gemsSummaryHandler from './_routes/gems-summary.js';
import {
  gemsComplianceHandler,
  gemsActionsHandler,
  gemsAuditHandler,
  gemsComplianceDocumentHandler,
} from './_routes/gems-records.js';

import { sendError } from './_lib/http.js';
import { HttpError } from './_lib/db.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

interface Route {
  /** Path relative to /api, e.g. '/gems/interactions'. */
  path: string;
  handler: Handler;
  description: string;
  /** When set, this route also answers any deeper path beneath it. */
  prefix?: boolean;
}

const ROUTES: Route[] = [
  // ── Identity (shared with KAIROS: same users table, same credentials) ──
  { path: '/auth/register', handler: registerHandler, description: 'Create an account' },
  { path: '/auth/login', handler: loginHandler, description: 'Exchange credentials for a session' },
  { path: '/auth/session', handler: sessionHandler, description: 'Resolve or clear the current session' },
  { path: '/auth/resend-code', handler: resendCodeHandler, description: 'Email another verification code' },
  { path: '/auth/sign-in', handler: signInProbeHandler, description: 'Does this address need a code?' },
  { path: '/auth/verify', handler: verifyHandler, description: 'Redeem a verification code' },
  { path: '/profile-photo', handler: profilePhotoHandler, description: 'Upload / remove your own profile photo' },

  // ── GEMS ──
  { path: '/gems/stakeholders', handler: gemsSummaryHandler, description: 'Stakeholders (agency-scoped contacts)' },
  { path: '/gems/agencies', handler: gemsSummaryHandler, description: 'Agencies, grouped' },
  { path: '/gems/summary', handler: gemsSummaryHandler, description: 'Dashboard summary' },
  { path: '/gems/notifications', handler: gemsSummaryHandler, description: 'Open actions and expiring compliance' },
  { path: '/gems/interactions', handler: gemsInteractionsHandler, description: 'Interaction log' },
  { path: '/gems/compliance', handler: gemsComplianceHandler, description: 'Compliance records' },
  { path: '/gems/compliance/document', handler: gemsComplianceDocumentHandler, description: 'Compliance document upload / removal' },
  { path: '/gems/actions', handler: gemsActionsHandler, description: 'Action items and follow-ups' },
  { path: '/gems/audit', handler: gemsAuditHandler, description: 'Append-only audit trail' },

  // ── Shared registry reads & writes ──
  { path: '/clients', handler: clientsHandler, description: 'List / create contacts' },
  { path: '/client', handler: clientHandler, description: 'Read / update / delete one contact' },
  { path: '/communications', handler: communicationsHandler, description: 'Interaction log for a contact' },
  { path: '/engagements', handler: engagementsHandler, description: 'Pipeline deals' },
  { path: '/automations', handler: automationsHandler, description: 'Automation rules' },
  { path: '/stage-history', handler: stageHistoryHandler, description: 'Stage change audit trail' },
  { path: '/biodata', handler: biodataHandler, description: 'Extended contact profile' },
  { path: '/biodata-photo', handler: biodataPhotoHandler, description: 'Contact photo upload / removal' },
  { path: '/access-requests', handler: accessRequestsHandler, description: 'Contact access requests' },
  { path: '/companies', handler: companyHandler, description: 'Company registry' },
  { path: '/lookups', handler: lookupHandler, description: 'Job title / project lookups' },
  { path: '/users', handler: userHandler, description: 'People registry and admin controls' },
  { path: '/acumen', handler: acumenHandler, description: 'Company documents' },

  { path: '/health', handler: healthHandler, description: 'Deployment diagnostics (unauthenticated)' },
];

const BY_PATH = new Map(ROUTES.filter((r) => !r.prefix).map((route) => [route.path, route]));

/** Normalises /api/gems/interactions/?x=1 to /gems/interactions. */
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
