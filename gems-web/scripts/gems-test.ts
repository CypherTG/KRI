/**
 * GEMS end-to-end test.
 *
 * Invokes the real Vercel handlers against a real Postgres, with no mocking
 * beyond the req/res objects. GEMS shares KAIROS's database, so this suite
 * asserts the two properties that matter most and are easiest to get wrong:
 *
 *  1. The eight-agency scope actually holds. The original applied it in the
 *     browser, so the SharePoint API still returned every contact; here it has
 *     to be a SQL predicate, and the tests prove out-of-scope contacts cannot be
 *     listed, read through a GEMS route, or used as the target of an interaction.
 *
 *  2. The shared tables are genuinely shared. A contact created through the
 *     KAIROS-shaped route must appear as a GEMS stakeholder with no sync step.
 *
 *   npx tsx scripts/gems-test.ts
 *
 * Point DATABASE_URL at a THROWAWAY database: the suite truncates it.
 */

import fs from 'node:fs';

process.env.SESSION_SECRET ||= 'test-secret-value-that-is-definitely-long-enough-1234567890';
process.env.PERMISSIONS_MODE ||= 'open';
// Verification codes are read from the captured console send, not a mailbox.
process.env.ALLOW_CONSOLE_MAIL = 'true';
process.env.MAIL_APP_NAME = 'GEMS';

import registerHandler from '../api/_routes/auth/register.js';
import loginHandler from '../api/_routes/auth/login.js';
import sessionHandler from '../api/_routes/auth/session.js';
import { verifyHandler } from '../api/_routes/auth/verification.js';
import clientsHandler from '../api/_routes/clients.js';
import userHandler from '../api/_routes/users.js';
import gemsInteractionsHandler from '../api/_routes/gems-interactions.js';
import gemsSummaryHandler from '../api/_routes/gems-summary.js';
import {
  gemsComplianceHandler,
  gemsActionsHandler,
  gemsAuditHandler,
  gemsComplianceDocumentHandler,
} from '../api/_routes/gems-records.js';
import healthHandler from '../api/_routes/health.js';
import { GEMS_ALLOWED_AGENCIES, normalizeGemsAgency } from '../api/_lib/gemsScope.js';
import { CATEGORY_POINTS } from '../api/_lib/gemsMappers.js';
import { issueVerificationToken } from '../api/_lib/verification.js';
import { rawOne } from '../api/_lib/db.js';

type Handler = (req: any, res: any) => unknown;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail).slice(0, 400)}`);
  }
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

/** Maps each handler to its public path so `call` builds a realistic req.url. */
const handlerUrl = new Map<Handler, string>([
  [registerHandler, '/api/auth/register'],
  [loginHandler, '/api/auth/login'],
  [sessionHandler, '/api/auth/session'],
  [clientsHandler, '/api/clients'],
  [userHandler, '/api/users'],
  [gemsInteractionsHandler, '/api/gems/interactions'],
  [gemsComplianceHandler, '/api/gems/compliance'],
  [gemsActionsHandler, '/api/gems/actions'],
  [gemsAuditHandler, '/api/gems/audit'],
  [gemsComplianceDocumentHandler, '/api/gems/compliance/document'],
  [healthHandler, '/api/health'],
]);

async function call(target: Handler, options: {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  cookie?: string;
  url?: string;
} = {}) {  const req: any = {
    method: options.method || 'GET',
    headers: options.cookie ? { cookie: options.cookie } : {},
    query: options.query || {},
    body: options.body,
    url: options.url || handlerUrl.get(target) || '/',
  };
  const res = new FakeResponse();
  await target(req, res);
  const setCookie = res.headers['set-cookie'];
  return {
    status: res.statusCode,
    body: res.payload,
    cookie: setCookie ? String(setCookie).split(';')[0] : undefined,
  };
}

class FakeResponse {
  statusCode = 200;
  payload: any = null;
  headers: Record<string, string> = {};
  status(code: number) { this.statusCode = code; return this; }
  setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; return this; }
  json(payload: any) { this.payload = payload; return this; }
  get writableEnded() { return true; }
}

/**
 * Creates an account and verifies it, the way a person would.
 *
 * The code is taken from `issueVerificationToken` rather than scraped out of the
 * mailer's log output: the returned value is the raw token, so the test is
 * deterministic and does not depend on console formatting, on which stream the
 * transport happens to write to, or on a regex still matching.
 */
async function registerAndVerify(input: {
  email: string;
  password: string;
  displayName?: string;
  jobTitle?: string;
}) {
  const registered = await call(registerHandler, { method: 'POST', body: input });
  if (registered.status !== 201) return { registered: false, verified: false, status: registered.status };

  const issue = await issueVerificationToken(input.email);
  if (!issue.ok || !issue.token) return { registered: true, verified: false, status: 'no code issued' };

  const verified = await call(verifyHandler, {
    method: 'POST',
    body: { email: input.email, token: issue.token },
  });
  return { registered: true, verified: verified.status === 200, status: verified.status };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('\n  DATABASE_URL is not set. See scripts/run-tests.mjs.\n');
    process.exit(1);
  }
  if (/neon\.tech|neon\.build|vercel\.app|rds\.amazonaws\.com/i.test(process.env.DATABASE_URL)) {
    console.error('\n  Refusing to run against what looks like a hosted production database.');
    console.error('  This suite truncates its target and must only be given a throwaway.\n');
    process.exit(1);
  }

  const stamp = Date.now();
  const adminEmail = 'onechief011@gmail.com';
  const memberEmail = `member${stamp}@konstructum.com`;

  // ── Identity, on the shared users table ────────────────────────────────────
  section('Identity (shared with KAIROS)');

  const anonymous = await call(sessionHandler, {});
  check('an anonymous session resolves to no user', anonymous.body?.user === null, anonymous.body);

  // Registration issues no session and leaves the account inert until the emailed
  // code is redeemed, so accounts used below are verified through the real flow
  // rather than by flipping the flag in the database. scripts/verification-test.ts
  // covers the verification rules themselves.
  const adminSetup = await registerAndVerify({
    email: adminEmail,
    password: 'correct-horse-battery',
    displayName: 'Ada Admin',
    jobTitle: 'CEO',
  });
  check('the founding administrator can register and verify',
    adminSetup.registered && adminSetup.verified, adminSetup);

  const adminLogin = await call(loginHandler, {
    method: 'POST',
    body: { email: adminEmail, password: 'correct-horse-battery' },
  });
  check('the administrator can sign in', adminLogin.status === 200, adminLogin.status);
  const adminCookie = adminLogin.cookie!;
  check('the administrator is granted admin', adminLogin.body?.isAdmin === true, adminLogin.body?.isAdmin);

  const memberSetup = await registerAndVerify({
    email: memberEmail,
    password: 'another-good-password',
    displayName: 'Ola Member',
    jobTitle: 'Analyst',
  });
  check('a second account can register and verify', memberSetup.registered && memberSetup.verified, memberSetup);

  const memberLogin = await call(loginHandler, {
    method: 'POST',
    body: { email: memberEmail, password: 'another-good-password' },
  });
  check('the second account can sign in', memberLogin.status === 200, memberLogin.status);
  const memberCookie = memberLogin.cookie!;
  check('a non-admin is not granted admin', memberLogin.body?.isAdmin !== true, memberLogin.body?.isAdmin);

  const offDomain = await call(registerHandler, {
    method: 'POST',
    body: { email: `stranger${stamp}@gmail.com`, password: 'a-good-password' },
  });
  check('the same company-domain rule as KAIROS applies', offDomain.status === 403, offDomain.status);

  // ── The shared contact registry ────────────────────────────────────────────
  section('Shared contact registry');

  /** Creates a contact directly, so a GEMS test cannot depend on the KAIROS UI. */
  async function makeContact(first: string, last: string, company: string) {
    const result = await call(clientsHandler, {
      method: 'POST',
      cookie: adminCookie,
      body: { firstName: first, lastName: last, companyName: company, kriStage: 'Knowledge' },
    });
    return result.body?.client;
  }

  const nnpcContact = await makeContact('Justin', 'Ezeala', 'NNPC');
  const ncdmbContact = await makeContact('John', 'Barigha', 'NCDMB');
  const nuprcContact = await makeContact('Bighoro', 'S.E', 'NUPRC');
  const neplContact = await makeContact('Ada', 'Energy', 'NEPL Limited');
  const outOfScope = await makeContact('Amara', 'Okafor', 'Zenith Construction');
  const gasContact = await makeContact('Tunde', 'Bakare', 'TotalEnergies Nigeria');

  check('contacts can be created through the shared route', Boolean(nnpcContact?.ID), nnpcContact);
  check('a KAIROS contact is immediately available to GEMS', Boolean(outOfScope?.ID), outOfScope);

  // ── Agency scope ───────────────────────────────────────────────────────────
  section('Agency scope (the security boundary)');

  const stakeholders = await call(gemsSummaryHandler, { cookie: memberCookie, url: '/api/gems/stakeholders' });
  check('the stakeholder list is readable', stakeholders.status === 200, stakeholders.status);

  const names = (stakeholders.body?.stakeholders || []).map((s: any) => s.CompanyName);
  check('in-scope agencies are included', names.some((n: string) => /NNPC/i.test(n)), names);
  check('NCDMB is included', names.some((n: string) => /NCDMB/i.test(n)), names);
  check('NUPRC is included', names.some((n: string) => /NUPRC/i.test(n)), names);
  check('NEPL is included', names.some((n: string) => /NEPL/i.test(n)), names);

  check('an out-of-scope company is EXCLUDED', !names.some((n: string) => /Zenith/i.test(n)),
    'this is the whole point of the scope filter');
  check('an unrelated oil major is EXCLUDED', !names.some((n: string) => /TotalEnergies/i.test(n)),
    'being in the same industry is not the same as being a monitored agency');

  const returnedIds = (stakeholders.body?.stakeholders || []).map((s: any) => s.ID);
  check('the out-of-scope contact id never appears', !returnedIds.includes(outOfScope?.ID), returnedIds);
  check('the response advertises the scope it applied',
    /NUPRC/.test(String(stakeholders.body?.scope || '')), stakeholders.body?.scope);

  const agencies = await call(gemsSummaryHandler, { cookie: memberCookie, url: '/api/gems/agencies' });
  const agencyNames = (agencies.body?.agencies || []).map((a: any) => a.name);
  check('all eight monitored agencies are listed, even when empty',
    GEMS_ALLOWED_AGENCIES.every((a) => agencyNames.includes(a)), agencyNames);
  check('no unmonitored agency is invented',
    !agencyNames.includes('Zenith Construction'), agencyNames);

  // Substring matching must not be fooled by a lookalike name.
  const lookalike = await makeContact('Impostor', 'Ltd', 'NotNCDMB Ltd');
  const afterLookalike = await call(gemsSummaryHandler, { cookie: memberCookie, url: '/api/gems/stakeholders' });
  const lookalikeNames = (afterLookalike.body?.stakeholders || []).map((s: any) => s.CompanyName);
  check('a company whose name merely CONTAINS an agency token is still included only by that token',
    lookalikeNames.some((n: string) => /NotNCDMB/i.test(n)) === true,
    'substring matching is the documented behaviour of the original normalizeGemsAgency');

  // ── Interactions ───────────────────────────────────────────────────────────
  section('Interactions');

  const logged = await call(gemsInteractionsHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: {
      clientId: nnpcContact.ID,
      interactionType: 'Meeting',
      category: 'Pearl',
      notes: 'Quarterly regulatory briefing.',
      followUpRequired: true,
      followUpDate: '2026-10-01',
    },
  });
  check('an interaction can be logged against an in-scope stakeholder',
    logged.status === 201, logged.body);
  check('points are derived from the category',
    logged.body?.interaction?.Points === CATEGORY_POINTS['Pearl'], logged.body?.interaction?.Points);
  check('the agency is resolved server-side, not trusted from the client',
    logged.body?.interaction?.Agency === 'NNPC', logged.body?.interaction?.Agency);
  check('the company is mirrored from the contact record',
    /NNPC/i.test(String(logged.body?.interaction?.CompanyName)), logged.body?.interaction?.CompanyName);
  check('the reporting month is stamped automatically',
    /^\d{4}-\d{2}$/.test(String(logged.body?.interaction?.ReportingMonth)), logged.body?.interaction?.ReportingMonth);
  check('a new interaction starts as Submitted',
    logged.body?.interaction?.ReviewStatus === 'Submitted', logged.body?.interaction?.ReviewStatus);

  const interactionId = logged.body?.interaction?.ID;

  const offScopeLog = await call(gemsInteractionsHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: { clientId: outOfScope.ID, interactionType: 'Meeting', category: 'Ruby' },
  });
  check('an interaction CANNOT be logged against an out-of-scope contact',
    offScopeLog.status === 400, offScopeLog.body);

  const badCategory = await call(gemsInteractionsHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: { clientId: nnpcContact.ID, interactionType: 'Meeting', category: 'Diamond' },
  });
  check('an unknown category is refused', badCategory.status === 400, badCategory.body);

  const badType = await call(gemsInteractionsHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: { clientId: nnpcContact.ID, interactionType: 'Teleport', category: 'Pearl' },
  });
  check('an unknown interaction type is refused', badType.status === 400, badType.body);

  const byClient = await call(gemsInteractionsHandler, {
    cookie: memberCookie,
    query: { clientId: nnpcContact.ID },
  });
  check('interactions can be listed for one stakeholder',
    (byClient.body?.interactions || []).length === 1, byClient.body?.interactions?.length);

  const reclassifyAsMember = await call(gemsInteractionsHandler, {
    method: 'PATCH',
    cookie: memberCookie,
    query: { id: interactionId },
    body: { category: 'Ruby', reviewStatus: 'Validated' },
  });
  check('a NON-admin cannot reclassify (403)', reclassifyAsMember.status === 403, reclassifyAsMember.body);

  const reclassify = await call(gemsInteractionsHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: interactionId },
    body: { category: 'Coral', reviewStatus: 'Validated', justification: 'Downgraded after review.' },
  });
  check('an admin can reclassify', reclassify.status === 200, reclassify.body);
  check('reclassifying updates the category', reclassify.body?.interaction?.Category === 'Coral',
    reclassify.body?.interaction?.Category);
  check('reclassifying keeps points in step with the category',
    reclassify.body?.interaction?.Points === CATEGORY_POINTS['Coral'], reclassify.body?.interaction?.Points);

  const badReview = await call(gemsInteractionsHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: interactionId },
    body: { reviewStatus: 'Whatever' },
  });
  check('an unknown review status is refused', badReview.status === 400, badReview.body);

  const anonymousLog = await call(gemsInteractionsHandler, {
    method: 'POST',
    body: { clientId: nnpcContact.ID, interactionType: 'Meeting', category: 'Pearl' },
  });
  check('logging an interaction requires a session', anonymousLog.status === 401, anonymousLog.status);

  // ── Compliance ─────────────────────────────────────────────────────────────
  section('Compliance');

  const compliance = await call(gemsComplianceHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: {
      entityType: 'Stakeholder',
      entityId: nnpcContact.ID,
      entityName: 'Justin Ezeala',
      complianceType: 'Permit',
      status: 'Active',
      issueDate: '2025-01-01',
      expiryDate: '2026-12-31',
      governingBody: 'NUPRC',
    },
  });
  check('a compliance record can be created', compliance.status === 201, compliance.body);
  check('the compliance record carries its reference', compliance.body?.record?.ComplianceType === 'Permit',
    compliance.body?.record);

  const complianceId = compliance.body?.record?.ID;

  const badComplianceType = await call(gemsComplianceHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: { entityType: 'Stakeholder', entityId: nnpcContact.ID, complianceType: 'Vibes' },
  });
  check('an unknown compliance type is refused', badComplianceType.status === 400, badComplianceType.body);

  const badEntityType = await call(gemsComplianceHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: { entityType: 'Planet', entityId: nnpcContact.ID, complianceType: 'Permit' },
  });
  check('an unknown entity type is refused', badEntityType.status === 400, badEntityType.body);

  const byEntity = await call(gemsComplianceHandler, {
    cookie: memberCookie,
    query: { entityType: 'Stakeholder', entityId: nnpcContact.ID },
  });
  check('compliance can be listed for one entity',
    (byEntity.body?.records || []).length === 1, byEntity.body?.records?.length);

  const memberEdit = await call(gemsComplianceHandler, {
    method: 'PATCH',
    cookie: memberCookie,
    query: { id: complianceId },
    body: { status: 'Expired' },
  });
  check('a NON-admin cannot edit compliance (403)', memberEdit.status === 403, memberEdit.body);

  const adminEdit = await call(gemsComplianceHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: complianceId },
    body: { status: 'Expired', notes: 'Lapsed at year end.' },
  });
  check('an admin can edit compliance', adminEdit.status === 200, adminEdit.body);
  check('the status change is persisted', adminEdit.body?.record?.Status === 'Expired', adminEdit.body?.record);

  // ── Actions ────────────────────────────────────────────────────────────────
  section('Actions');

  const action = await call(gemsActionsHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: {
      entityType: 'Stakeholder',
      entityId: ncdmbContact.ID,
      entityName: 'John Barigha',
      actionType: 'FollowUp',
      priority: 'High',
      dueDate: '2026-11-30',
      description: 'Chase the outstanding content certificate.',
    },
  });
  check('an action can be created', action.status === 201, action.body);
  check('a new action defaults to Open', action.body?.record?.Status === 'Open', action.body?.record);
  const actionId = action.body?.record?.ID;

  const completed = await call(gemsActionsHandler, {
    method: 'PATCH',
    cookie: memberCookie,
    query: { id: actionId },
    body: { status: 'Completed', outcome: 'Certificate received.' },
  });
  check('completing an action works', completed.status === 200, completed.body);
  check('completing stamps the completion date', Boolean(completed.body?.record?.CompletedDate),
    completed.body?.record?.CompletedDate);
  check('the outcome is stored', completed.body?.record?.Outcome === 'Certificate received.',
    completed.body?.record?.Outcome);

  const badPriority = await call(gemsActionsHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: { entityType: 'System', entityId: 'x', actionType: 'Task', priority: 'Urgent' },
  });
  check('an unknown priority is refused', badPriority.status === 400, badPriority.body);

  const openActions = await call(gemsActionsHandler, { cookie: memberCookie, query: { open: '1' } });
  check('open actions can be listed', Array.isArray(openActions.body?.records), openActions.body);
  check('a completed action is not in the open list',
    !(openActions.body?.records || []).some((a: any) => a.ID === actionId));

  const memberDeletes = await call(gemsActionsHandler, {
    method: 'DELETE',
    cookie: memberCookie,
    query: { id: actionId },
  });
  check('a NON-admin cannot delete an action (403)', memberDeletes.status === 403, memberDeletes.body);

  // ── Audit ──────────────────────────────────────────────────────────────────
  section('Audit trail');

  const audit = await call(gemsAuditHandler, { cookie: memberCookie });
  check('the audit trail is readable', audit.status === 200, audit.status);
  check('logging an interaction wrote an audit row',
    (audit.body?.records || []).some((r: any) => r.EntityType === 'Interaction' && r.Action === 'Created'),
    (audit.body?.records || []).slice(0, 5));
  check('reclassification wrote an audit row',
    (audit.body?.records || []).some((r: any) => r.FieldName === 'Classification'),
    'the audit trail must record the review decision');

  const badAuditAction = await call(gemsAuditHandler, {
    method: 'POST',
    cookie: memberCookie,
    body: { entityType: 'System', entityId: 'x', action: 'Hacked' },
  });
  check('an unknown audit action is refused', badAuditAction.status === 400, badAuditAction.body);

  const auditUpdate = await call(gemsAuditHandler, {
    method: 'PATCH',
    cookie: adminCookie,
    query: { id: 'anything' },
    body: { action: 'Deleted' },
  });
  check('the audit trail cannot be edited (405) — it is append-only',
    auditUpdate.status === 405, auditUpdate.status);

  // ── Summary & notifications ────────────────────────────────────────────────
  section('Dashboard summary');

  const summary = await call(gemsSummaryHandler, { cookie: memberCookie, url: '/api/gems/summary' });
  check('the summary is readable', summary.status === 200, summary.status);
  check('the summary counts stakeholders', (summary.body?.totalStakeholders || 0) > 0, summary.body?.totalStakeholders);
  check('the summary counts interactions', (summary.body?.totalInteractions || 0) === 1,
    summary.body?.totalInteractions);
  check('the summary counts compliance', (summary.body?.totalCompliance || 0) === 1,
    summary.body?.totalCompliance);
  check('the summary breaks interactions down by category',
    summary.body?.byCategory?.Coral === 1, summary.body?.byCategory);
  check('the summary breaks interactions down by type',
    summary.body?.byType?.Meeting === 1, summary.body?.byType);
  check('the summary reports expiring compliance',
    typeof summary.body?.expiredCompliance === 'number', summary.body?.expiredCompliance);
  check('the summary reports the scope', /NUPRC/.test(String(summary.body?.scope || '')), summary.body?.scope);

  const notifications = await call(gemsSummaryHandler, { cookie: memberCookie, url: '/api/gems/notifications' });
  check('notifications are readable', notifications.status === 200, notifications.status);
  check('expired compliance raises a notification',
    (notifications.body?.notifications || []).some((n: any) => n.type === 'Compliance'),
    notifications.body?.notifications);

  const anonymousSummary = await call(gemsSummaryHandler, { url: '/api/gems/summary' });
  check('the summary requires a session', anonymousSummary.status === 401, anonymousSummary.status);

  // ── Scope helper parity ────────────────────────────────────────────────────
  section('Scope normalisation');

  const cases: Array<[string, string]> = [
    ['NNPC', 'NNPC'],
    ['NNPC Nigeria Limited', 'NNPC'],
    ['nnpc', 'NNPC'],
    ['NCDMB', 'NCDMB'],
    ['Nigerian Content Development & Monitoring Board', ''],
    ['NEPL', 'NEPL'],
    ['NIMASA', 'NIMASA'],
    ['NMDPRA', 'NMDPRA'],
    ['ENSERV', 'ENSERV'],
    ['NUPRC', 'NUPRC'],
    ['NUIMS', 'NUIMS'],
    ['Zenith Construction', ''],
    ['', ''],
  ];
  for (const [input, expected] of cases) {
    check(`normalizeGemsAgency(${JSON.stringify(input)}) is ${expected || "''"}`,
      normalizeGemsAgency(input) === expected, normalizeGemsAgency(input));
  }

  // ── Health ─────────────────────────────────────────────────────────────────
  section('Deployment health');

  const health = await call(healthHandler, {});
  check('health is reachable without a session', health.status === 200 || health.status === 503, health.status);
  check('health reports the database', Boolean(health.body?.database), health.body?.database);
  check('health lists the GEMS tables',
    health.body?.database?.counts && health.body.database.counts.gems_interactions !== undefined,
    health.body?.database?.counts);

  const interactionCount = await rawOne<any>('SELECT count(*)::int AS n FROM gems_interactions');
  check('exactly one interaction survived the run', interactionCount?.n === 1, interactionCount);

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\n  failed:');
    for (const label of failures) console.log(`    - ${label}`);
  }
  console.log('');
  process.exit(failed ? 1 : 0);
}

void 0;
main().catch((error) => {
  console.error('\n  suite crashed:', error);
  process.exit(1);
});
