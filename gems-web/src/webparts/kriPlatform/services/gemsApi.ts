import { KriContext, apiRequest, fileToBase64 } from '../../../types/kri';

/**
 * GEMS data access.
 *
 * Replaces the SharePoint REST layer in the original build. Every function here
 * has the same name, arguments and return shape as its SharePoint counterpart,
 * so the ported React components call exactly what they always did — only the
 * transport changed, from `_api/web/lists/getbytitle(...)` to `/api/gems/*`.
 *
 * Two behaviours are enforced on the server rather than here, because the
 * browser is not trusted:
 *  · the eight-agency scope on stakeholders and agencies;
 *  · reclassification and deletion of interactions, which are admin-only.
 *
 * The client still applies the agency filter to what it receives, because the
 * original components rely on `isGemsEligibleInteraction` for empty states and
 * labels. It is a display concern only — the server has already removed
 * out-of-scope rows.
 */
import {
  GEMS_ALLOWED_AGENCIES,
  GEMS_AGENCY_OPTIONS,
  agencyMatchesTarget,
  filterGemsEligibleClients,
  isGemsEligibleClient,
  isGemsEligibleInteraction,
  normalizeGemsAgency,
} from '../utils/gemsScope';
import type { IClient } from './graphApi';
import { getKRIUsers } from './graphApi';

/**
 * The shared registry helpers GEMS components still need, re-exported here so
 * every GEMS module has one import path. In the original these came from
 * `sharepointProvisioning` alongside the GEMS functions; splitting the two
 * would mean every component importing from two places.
 */
export {
  getClientBiodataRecord,
  saveClientBiodataRecord,
  getCompanyAcumenRecords,
  saveCompanyAcumenFile,
  upsertCompanyRegistryRecord,
  ensureKairosClientManagementFields,
  getContactAccessRequestsForUser,
  getContactAccessRequestsForOwner,
  requestContactAccess,
} from './sharepointProvisioning';
export type {
  BiodataRecord,
  CompanyAcumenRecord,
  KairosContactAccessRequest,
} from './sharepointProvisioning';

// ─── Re-exports so components keep importing them from the historical paths ───
export {
  GEMS_ALLOWED_AGENCIES,
  GEMS_AGENCY_OPTIONS,
  agencyMatchesTarget,
  filterGemsEligibleClients,
  isGemsEligibleClient,
  isGemsEligibleInteraction,
  normalizeGemsAgency,
};

/** Points per category. Preserved from the original, Ruby and Crown Jewel both 1. */
export const GEMS_CATEGORY_POINTS: Record<string, number> = {
  'Crown Jewel': 1,
  Pearl: 5,
  Coral: 3,
  Ruby: 1,
};

export interface GemsInteractionRecord {
  ID: string;
  Title: string;
  ClientID: string;
  ClientName: string;
  CompanyKey: string;
  CompanyName: string;
  Agency: string;
  BusinessArm: string;
  InteractionType: string;
  Category: string;
  FinalClassification: string;
  InfluencePercent: number;
  Points: number;
  Notes: string;
  Justification: string;
  ReviewStatus: string;
  WeekStart: string;
  ReportingMonth: string;
  LoggedBy: string;
  LoggedAt: string;
  TargetUser: string;
  TargetUserId: string;
  KRIClassification: string;
  ExecutiveInvolvementRequested: boolean;
  ExecutiveMonthlyPointsAtLog: number;
  FollowUpRequired: boolean;
  FollowUpDate: string;
  ScheduledDate: string;
}

export interface GemsComplianceRecord {
  ID: string;
  Title: string;
  EntityType: string;
  EntityId: string;
  EntityName: string;
  ComplianceType: string;
  Status: string;
  IssueDate: string;
  ExpiryDate: string;
  RenewalDate: string;
  GoverningBody: string;
  ReferenceNumber: string;
  Description: string;
  Notes: string;
  AssignedTo: string;
  DocumentsJson: string;
  LastCheckedDate: string;
  AlertSent: boolean;
}

export interface GemsActionRecord {
  ID: string;
  Title: string;
  EntityType: string;
  EntityId: string;
  EntityName: string;
  ActionType: string;
  Priority: string;
  Status: string;
  DueDate: string;
  CompletedDate: string;
  AssignedTo: string;
  Description: string;
  Source: string;
  SourceId: string;
  Outcome: string;
  CreatedBy: string;
  CreatedAt: string;
}

export interface GemsAuditLogRecord {
  ID: string;
  Title: string;
  EntityType: string;
  EntityId: string;
  Action: string;
  FieldName: string;
  OldValue: string;
  NewValue: string;
  UserName: string;
  UserEmail: string;
  Timestamp: string;
  Source: string;
  Details: string;
}

export function normalizeGemsLookupKey(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function coerceBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Write-side shapes.
 *
 * The record interfaces above are the read shape and are PascalCase, because
 * that is what the original SharePoint list items looked like and the components
 * render them directly. The components however *write* in camelCase, so writes
 * take these instead of `Partial<Record>` — otherwise every create call would
 * need a cast. The server accepts either casing.
 */
export interface GemsInteractionInput {
  clientId?: string;
  clientID?: string;
  clientName?: string;
  companyKey?: string;
  companyName?: string;
  agency?: string;
  businessArm?: string;
  interactionType?: string;
  category?: string;
  finalClassification?: string;
  influencePercent?: number;
  notes?: string;
  justification?: string;
  reviewStatus?: string;
  weekStart?: string;
  reportingMonth?: string;
  loggedBy?: string;
  targetUser?: string;
  targetUserId?: string;
  kriClassification?: string;
  executiveInvolvementRequested?: boolean;
  executiveMonthlyPointsAtLog?: number;
  followUpRequired?: boolean;
  followUpDate?: string;
  scheduledDate?: string;
}

export interface GemsComplianceInput {
  entityType?: string;
  entityId?: string;
  entityName?: string;
  complianceType?: string;
  status?: string;
  issueDate?: string;
  expiryDate?: string;
  renewalDate?: string;
  governingBody?: string;
  referenceNumber?: string;
  description?: string;
  notes?: string;
  assignedTo?: string;
  assignedToId?: string;
  lastCheckedDate?: string;
  alertSent?: boolean;
}

export interface GemsActionInput {
  entityType?: string;
  entityId?: string;
  entityName?: string;
  actionType?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  assignedTo?: string;
  assignedToId?: string;
  description?: string;
  source?: string;
  sourceId?: string;
  outcome?: string;
}

export interface GemsAuditInput {
  entityType?: string;
  entityId?: string;
  action?: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  source?: string;
  details?: string;
}

/** What the review workspace passes when it reclassifies an interaction. */
export interface GemsNotificationInput {
  interactionId?: string;
  entityName?: string;
  category?: string;
  recipients?: string[];
  employeeEmail?: string;
  employeeName?: string;
  stakeholderName?: string;
  previousCategory?: string;
  newCategory?: string;
  reviewedBy?: string;
}

// ─── Stakeholders & agencies ───────────────────────────────────────────────────

export async function loadGemsStakeholders(context: KriContext): Promise<IClient[]> {
  const result = await apiRequest<{ stakeholders: IClient[] }>('/gems/stakeholders');
  return filterGemsEligibleClients(result.stakeholders || []);
}

export async function loadGemsAgencyDetail(
  context: KriContext,
  agencyKey: string,
): Promise<{ agency: any; stakeholders: IClient[]; interactions: GemsInteractionRecord[] }> {
  const normalizedKey = normalizeLookupKey(agencyKey);
  const result = await apiRequest<{ agencies: any[] }>('/gems/agencies');
  const agency = (result.agencies || []).find((a) => a.key === normalizedKey) || null;
  const interactions = agency ? await getGemsInteractionsByCompany(context, normalizedKey) : [];
  return { agency, stakeholders: agency?.clients || [], interactions };
}

function normalizeLookupKey(value: string): string {
  return String(value || '').trim().toLowerCase();
}

// ─── Interactions ─────────────────────────────────────────────────────────────

export async function getGemsInteractions(
  context: KriContext,
  options: { month?: string } = {},
): Promise<GemsInteractionRecord[]> {
  const result = await apiRequest<{ interactions: GemsInteractionRecord[] }>('/gems/interactions', {
    query: options.month ? { month: options.month } : {},
  });
  return result.interactions || [];
}

export async function getGemsInteractionsByClient(
  context: KriContext,
  clientId: string,
): Promise<GemsInteractionRecord[]> {
  if (!clientId) return [];
  const result = await apiRequest<{ interactions: GemsInteractionRecord[] }>('/gems/interactions', {
    query: { clientId },
  });
  return result.interactions || [];
}

export async function getGemsInteractionsByCompany(
  context: KriContext,
  companyKey: string,
): Promise<GemsInteractionRecord[]> {
  if (!companyKey) return [];
  const result = await apiRequest<{ interactions: GemsInteractionRecord[] }>('/gems/interactions', {
    query: { companyKey },
  });
  return result.interactions || [];
}

export async function getGemsInteractionsByEmployee(
  context: KriContext,
  employeeName: string,
): Promise<GemsInteractionRecord[]> {
  const all = await getGemsInteractions(context);
  const key = String(employeeName || '').trim().toLowerCase();
  if (!key) return [];
  return all.filter((row) => String(row.LoggedBy || '').toLowerCase().includes(key));
}

export async function logGemsInteraction(
  context: KriContext,
  data: GemsInteractionInput,
): Promise<GemsInteractionRecord> {
  const result = await apiRequest<{ interaction: GemsInteractionRecord }>('/gems/interactions', {
    method: 'POST',
    body: data as any,
  });
  return result.interaction;
}

export async function updateGemsInteractionClassification(
  context: KriContext,
  id: string,
  data: {
    category?: string;
    finalClassification?: string;
    reviewStatus?: string;
    justification?: string;
    influencePercent?: number;
  },
): Promise<GemsInteractionRecord> {
  const result = await apiRequest<{ interaction: GemsInteractionRecord }>('/gems/interactions', {
    method: 'PATCH',
    query: { id },
    body: data as any,
  });
  return result.interaction;
}

export async function deleteGemsInteraction(context: KriContext, id: string): Promise<void> {
  await apiRequest('/gems/interactions', { method: 'DELETE', query: { id } });
}

// ─── Compliance ───────────────────────────────────────────────────────────────

export async function getComplianceRecords(
  context: KriContext,
  filter?: { entityType?: string; entityId?: string },
): Promise<GemsComplianceRecord[]> {
  const result = await apiRequest<{ records: GemsComplianceRecord[] }>('/gems/compliance', {
    query: filter || {},
  });
  return result.records || [];
}

export async function getComplianceByEntity(
  context: KriContext,
  entityType: string,
  entityId: string,
): Promise<GemsComplianceRecord[]> {
  if (!entityId) return [];
  return getComplianceRecords(context, { entityType, entityId });
}

export async function createComplianceRecord(
  context: KriContext,
  data: GemsComplianceInput,
): Promise<GemsComplianceRecord> {
  const result = await apiRequest<{ record: GemsComplianceRecord }>('/gems/compliance', {
    method: 'POST',
    body: data as any,
  });
  return result.record;
}

export async function updateComplianceRecord(
  context: KriContext,
  id: string,
  data: GemsComplianceInput,
): Promise<GemsComplianceRecord> {
  const result = await apiRequest<{ record: GemsComplianceRecord }>('/gems/compliance', {
    method: 'PATCH',
    query: { id },
    body: data as any,
  });
  return result.record;
}

export async function deleteComplianceRecord(context: KriContext, id: string): Promise<void> {
  await apiRequest('/gems/compliance', { method: 'DELETE', query: { id } });
}

export async function uploadComplianceAttachment(
  context: KriContext,
  id: string,
  file: File,
): Promise<{ record: GemsComplianceRecord; url: string }> {
  const base64 = await fileToBase64(file);
  return apiRequest<{ record: GemsComplianceRecord; url: string }>('/gems/compliance/document', {
    method: 'POST',
    body: { id, base64, contentType: file.type || 'application/octet-stream', fileName: file.name },
  });
}

export async function getComplianceAttachments(
  context: KriContext,
  id: string,
): Promise<Array<{ fileName: string; serverRelativeUrl: string; url: string; size?: number }>> {
  if (!id) return [];
  const records = await getComplianceRecords(context, {});
  const record = records.find((r) => r.ID === id);
  if (!record?.DocumentsJson) return [];
  let parsed: Array<{ name?: string; fileName?: string; url?: string; serverRelativeUrl?: string; size?: number }>;
  try {
    parsed = JSON.parse(record.DocumentsJson);
  } catch {
    return [];
  }
  // `serverRelativeUrl` is the SharePoint-era key the component renders. The value
  // is now an absolute Blob URL, so both keys are populated and the component
  // works unchanged.
  return (parsed || []).map((entry) => {
    const url = String(entry.url || entry.serverRelativeUrl || '');
    return { fileName: String(entry.fileName || entry.name || ''), serverRelativeUrl: url, url, size: entry.size };
  });
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function getActionRecords(
  context: KriContext,
  filter?: { entityType?: string; entityId?: string },
): Promise<GemsActionRecord[]> {
  const result = await apiRequest<{ records: GemsActionRecord[] }>('/gems/actions', {
    query: filter || {},
  });
  return result.records || [];
}

export async function getActionsByEntity(
  context: KriContext,
  entityType: string,
  entityId: string,
): Promise<GemsActionRecord[]> {
  if (!entityId) return [];
  return getActionRecords(context, { entityType, entityId });
}

export async function getOpenActions(context: KriContext): Promise<GemsActionRecord[]> {
  const result = await apiRequest<{ records: GemsActionRecord[] }>('/gems/actions', {
    query: { open: '1' },
  });
  return result.records || [];
}

export async function createActionRecord(
  context: KriContext,
  data: GemsActionInput,
): Promise<GemsActionRecord> {
  const result = await apiRequest<{ record: GemsActionRecord }>('/gems/actions', {
    method: 'POST',
    body: data as any,
  });
  return result.record;
}

export async function updateActionRecord(
  context: KriContext,
  id: string,
  data: GemsActionInput,
): Promise<GemsActionRecord> {
  const result = await apiRequest<{ record: GemsActionRecord }>('/gems/actions', {
    method: 'PATCH',
    query: { id },
    body: data as any,
  });
  return result.record;
}

export async function completeActionRecord(
  context: KriContext,
  id: string,
  outcome?: string,
): Promise<GemsActionRecord> {
  return updateActionRecord(context, id, { status: 'Completed', outcome });
}

export async function deleteActionRecord(context: KriContext, id: string): Promise<void> {
  await apiRequest('/gems/actions', { method: 'DELETE', query: { id } });
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export async function writeAuditLog(
  context: KriContext,
  entry: GemsAuditInput,
): Promise<GemsAuditLogRecord> {
  const result = await apiRequest<{ record: GemsAuditLogRecord }>('/gems/audit', {
    method: 'POST',
    body: entry as any,
  });
  return result.record;
}

export async function getAuditLogs(
  context: KriContext,
  filter?: { entityType?: string; entityId?: string },
): Promise<GemsAuditLogRecord[]> {
  const result = await apiRequest<{ records: GemsAuditLogRecord[] }>('/gems/audit', {
    query: filter || {},
  });
  return result.records || [];
}

export async function getAuditLogsByEntity(
  context: KriContext,
  entityType: string,
  entityId: string,
): Promise<GemsAuditLogRecord[]> {
  if (!entityId) return [];
  return getAuditLogs(context, { entityType, entityId });
}

/**
 * Notification dispatch.
 *
 * The original sent an email through SharePoint's alert email. There is no
 * equivalent here, so a notification is recorded in the audit trail instead —
 * which is durable and inspectable, where an SMTP call from a serverless
 * function would be neither reliable nor free.
 */
export async function sendClassificationNotification(
  context: KriContext,
  payload: GemsNotificationInput,
): Promise<void> {
  const recipients = payload?.recipients?.length
    ? payload.recipients
    : payload?.employeeEmail
      ? [payload.employeeEmail]
      : payload?.employeeName
        ? [payload.employeeName]
        : [];
  await writeAuditLog(context, {
    entityType: 'Interaction',
    entityId: String(payload?.interactionId || ''),
    action: 'Exported',
    fieldName: 'ClassificationNotification',
    newValue: String(payload?.category || ''),
    details: `Notification queued for ${recipients.join(', ') || 'reviewers'}`,
  });
}

/**
 * The people directory, in the shape the SharePoint `siteusers` endpoint used to
 * return. `id` stays a number because the original typed it that way and the
 * review workspace compares against it.
 */
export async function getGemsSiteUsers(
  context: KriContext,
): Promise<Array<{ name: string; email: string; id: number }>> {
  const users = await getKRIUsers(context);
  const seen = new Set<string>();
  return users
    .map((user) => ({ name: String(user.Title || ''), email: String(user.Email || ''), id: Number(user.ID) || 0 }))
    .filter((user) => {
      if (!user.name) return false;
      const key = user.email || user.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ─── Stakeholder health ───────────────────────────────────────────────────────

export interface StakeholderHealth {
  clientId: string;
  displayName: string;
  agency: string;
  stage: string;
  daysSinceLastInteraction: number;
  daysSinceLastComm: number;
  interactionCount: number;
  totalPoints: number;
  healthScore: number;
  healthLabel: 'Healthy' | 'At Risk' | 'Needs Attention' | 'Stale';
}

/**
 * Recency scoring for each stakeholder, blending GEMS interactions with the
 * shared communication log so a relationship that is being worked but not logged
 * in GEMS does not look abandoned. The banding is preserved from the original.
 */
export async function getStakeholderHealth(
  context: KriContext,
  clients: any[],
  interactions: any[],
  comms: any[],
): Promise<StakeholderHealth[]> {
  const today = Date.now();
  return clients.map((client) => {    const clientId = String(client.ID || '');
    const clientInteractions = interactions.filter((i: any) => String(i.ClientID) === clientId);
    const clientComms = comms.filter((c: any) => String(c.ClientID) === clientId);

    const lastInteraction = clientInteractions.length
      ? Math.max(...clientInteractions.map((i: any) => (i.LoggedAt ? new Date(i.LoggedAt).getTime() : 0)))
      : 0;
    const lastComm = clientComms.length
      ? Math.max(...clientComms.map((c: any) => (c.CommunicationDate ? new Date(c.CommunicationDate).getTime() : 0)))
      : 0;

    // 999 rather than Infinity, so the arithmetic below stays finite.
    const daysSinceLastInteraction = lastInteraction > 0 ? Math.round((today - lastInteraction) / 86400000) : 999;
    const daysSinceLastComm = lastComm > 0 ? Math.round((today - lastComm) / 86400000) : 999;
    const minDays = Math.min(daysSinceLastInteraction, daysSinceLastComm);

    let healthScore: number;
    let healthLabel: StakeholderHealth['healthLabel'];
    if (minDays <= 30) { healthScore = 100 - minDays; healthLabel = 'Healthy'; }
    else if (minDays <= 60) { healthScore = 60 - (minDays - 30); healthLabel = 'At Risk'; }
    else if (minDays <= 90) { healthScore = 30 - (minDays - 60); healthLabel = 'Needs Attention'; }
    else { healthScore = Math.max(0, 15 - (minDays - 90)); healthLabel = 'Stale'; }

    return {
      clientId,
      displayName: `${client.FirstName || ''} ${client.LastName || ''}`.trim() || client.CompanyName || 'Unknown',
      agency: client.CompanyName || '',
      stage: client.KRIStage || 'Knowledge',
      daysSinceLastInteraction,
      daysSinceLastComm,
      interactionCount: clientInteractions.length,
      totalPoints: clientInteractions.reduce((sum: number, i: any) => sum + Number(i.Points || 0), 0),
      healthScore: Math.max(0, Math.min(100, healthScore)),
      healthLabel,
    };
  });
}

// ─── Summary & notifications ──────────────────────────────────────────────────

/**
 * Flat, matching the original: the dashboard reads `summary.totalCompliance`
 * directly rather than `summary.stats.totalCompliance`.
 */
export interface GemsOperationalSummary {
  totalStakeholders: number;
  totalInteractions: number;
  totalPoints: number;
  pendingReview: number;
  openActions: number;
  complianceRecords: number;
  totalCompliance: number;
  activeCompliance: number;
  expiredCompliance: number;
  expiringSoonCompliance: number;
  pendingActions: number;
  overdueActions: number;
  dueSoonActions: number;
  completedActions: number;
  byCategory: Record<string, number>;
  pointsByCategory: Record<string, number>;
  byType: Record<string, number>;
  complianceByStatus: Record<string, number>;
  months: Array<{ month: string; count: number; points: number }>;
  agencies: Array<{ key: string; name: string; totalContacts: number }>;
  recentInteractions: GemsInteractionRecord[];
  recentCompliance: GemsComplianceRecord[];
  scope: string;
}

export async function getGemsOperationalSummary(
  context: KriContext,
): Promise<GemsOperationalSummary> {
  // The API returns the flat shape already, so there is nothing to reshape.
  return apiRequest<GemsOperationalSummary>('/gems/summary');
}

export interface GemsNotification {
  id: string;
  type: string;
  title: string;
  detail: string;
  dueDate?: string;
  entityType?: string;
  entityId?: string;
}

export async function getCurrentUserNotifications(
  context: KriContext,
): Promise<GemsNotification[]> {
  const result = await apiRequest<{ notifications: GemsNotification[] }>('/gems/notifications');
  return result.notifications || [];
}
