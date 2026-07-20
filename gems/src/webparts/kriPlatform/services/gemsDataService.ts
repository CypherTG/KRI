import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  listUrl,
  getRequestDigest,
  getJson,
  ensureListItem,
  deleteListItem,
  coerceBoolean,
  normalizeGemsLookupKey,
} from './sharepointProvisioning';
import { GEMS_LISTS_NEW, ensureGemsRuntimeReady } from './gemsProvisioning';

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

function normalizeCompliance(item: any): GemsComplianceRecord {
  return {
    ID: String(item.Id || item.ID || ''),
    Title: String(item.Title || ''),
    EntityType: String(item.EntityType || ''),
    EntityId: String(item.EntityId || ''),
    EntityName: String(item.EntityName || ''),
    ComplianceType: String(item.ComplianceType || ''),
    Status: String(item.Status || 'Pending'),
    IssueDate: String(item.IssueDate || ''),
    ExpiryDate: String(item.ExpiryDate || ''),
    RenewalDate: String(item.RenewalDate || ''),
    GoverningBody: String(item.GoverningBody || ''),
    ReferenceNumber: String(item.ReferenceNumber || ''),
    Description: String(item.Description || ''),
    Notes: String(item.Notes || ''),
    AssignedTo: String(item.AssignedTo || ''),
    DocumentsJson: String(item.DocumentsJson || '[]'),
    LastCheckedDate: String(item.LastCheckedDate || ''),
    AlertSent: coerceBoolean(item.AlertSent),
  };
}

function normalizeAction(item: any): GemsActionRecord {
  return {
    ID: String(item.Id || item.ID || ''),
    Title: String(item.Title || ''),
    EntityType: String(item.EntityType || ''),
    EntityId: String(item.EntityId || ''),
    EntityName: String(item.EntityName || ''),
    ActionType: String(item.ActionType || 'Task'),
    Priority: String(item.Priority || 'Medium'),
    Status: String(item.Status || 'Open'),
    DueDate: String(item.DueDate || ''),
    CompletedDate: String(item.CompletedDate || ''),
    AssignedTo: String(item.AssignedTo || ''),
    Description: String(item.Description || ''),
    Source: String(item.Source || ''),
    SourceId: String(item.SourceId || ''),
    Outcome: String(item.Outcome || ''),
    CreatedBy: String(item.CreatedBy || ''),
    CreatedAt: String(item.CreatedAt || ''),
  };
}

function normalizeAuditLog(item: any): GemsAuditLogRecord {
  return {
    ID: String(item.Id || item.ID || ''),
    Title: String(item.Title || ''),
    EntityType: String(item.EntityType || ''),
    EntityId: String(item.EntityId || ''),
    Action: String(item.Action || ''),
    FieldName: String(item.FieldName || ''),
    OldValue: String(item.OldValue || ''),
    NewValue: String(item.NewValue || ''),
    UserName: String(item.UserName || ''),
    UserEmail: String(item.UserEmail || ''),
    Timestamp: String(item.Timestamp || ''),
    Source: String(item.Source || ''),
    Details: String(item.Details || ''),
  };
}

function complianceQueryFields(): string[] {
  return [
    'Id', 'Title', 'EntityType', 'EntityId', 'EntityName',
    'ComplianceType', 'Status', 'IssueDate', 'ExpiryDate',
    'RenewalDate', 'GoverningBody', 'ReferenceNumber',
    'Description', 'Notes', 'AssignedTo', 'DocumentsJson',
    'LastCheckedDate', 'AlertSent',
  ];
}

function actionQueryFields(): string[] {
  return [
    'Id', 'Title', 'EntityType', 'EntityId', 'EntityName',
    'ActionType', 'Priority', 'Status', 'DueDate', 'CompletedDate',
    'AssignedTo', 'Description', 'Source', 'SourceId',
    'Outcome', 'CreatedBy', 'CreatedAt',
  ];
}

function auditLogQueryFields(): string[] {
  return [
    'Id', 'Title', 'EntityType', 'EntityId', 'Action',
    'FieldName', 'OldValue', 'NewValue', 'UserName', 'UserEmail',
    'Timestamp', 'Source', 'Details',
  ];
}

function buildListQuery(webUrl: string, listName: string, select: string[], filter?: string, top = 500, orderby = 'Id desc'): string {
  let url = `${listUrl(webUrl, listName)}/items?$select=${select.join(',')}&$orderby=${orderby}&$top=${top}`;
  if (filter) url += `&$filter=${filter}`;
  return url;
}

async function getItems<T>(webUrl: string, url: string, normalize: (item: any) => T): Promise<T[]> {
  const data = await getJson(webUrl, url).catch((): { value: any[] } => ({ value: [] }));
  return (data.value || []).map(normalize);
}

// --- Compliance CRUD ---

export async function getComplianceRecords(context: WebPartContext, filter?: string): Promise<GemsComplianceRecord[]> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const url = buildListQuery(webUrl, GEMS_LISTS_NEW.compliance, complianceQueryFields(), filter);
  return getItems(webUrl, url, normalizeCompliance);
}

export async function getComplianceByEntity(context: WebPartContext, entityType: string, entityId: string): Promise<GemsComplianceRecord[]> {
  const safeId = String(entityId || '').trim().replace(/'/g, "''");
  const safeType = String(entityType || '').trim().replace(/'/g, "''");
  if (!safeId) return [];
  return getComplianceRecords(context, `EntityType eq '${safeType}' and EntityId eq '${safeId}'`);
}

export async function createComplianceRecord(
  context: WebPartContext,
  data: {
    entityType: string;
    entityId: string;
    entityName?: string;
    complianceType: string;
    status?: string;
    issueDate?: string;
    expiryDate?: string;
    renewalDate?: string;
    governingBody?: string;
    referenceNumber?: string;
    description?: string;
    notes?: string;
    assignedTo?: string;
  }
): Promise<GemsComplianceRecord> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  await ensureGemsRuntimeReady(webUrl, digest);

  const title = `${data.complianceType} - ${data.entityName || data.entityId}`.trim();
  const created = await ensureListItem(webUrl, digest, GEMS_LISTS_NEW.compliance, {
    Title: title,
    EntityType: String(data.entityType),
    EntityId: String(data.entityId),
    EntityName: String(data.entityName || ''),
    ComplianceType: String(data.complianceType),
    Status: String(data.status || 'Pending'),
    IssueDate: String(data.issueDate || ''),
    ExpiryDate: String(data.expiryDate || ''),
    RenewalDate: String(data.renewalDate || ''),
    GoverningBody: String(data.governingBody || ''),
    ReferenceNumber: String(data.referenceNumber || ''),
    Description: String(data.description || ''),
    Notes: String(data.notes || ''),
    AssignedTo: String(data.assignedTo || ''),
    DocumentsJson: '[]',
    LastCheckedDate: new Date().toISOString().split('T')[0],
    AlertSent: false,
  });

  await writeAuditLog(context, {
    entityType: GEMS_LISTS_NEW.compliance,
    entityId: String(created?.Id || created?.ID || ''),
    action: 'Created',
    userName: context.pageContext.user.displayName,
    userEmail: context.pageContext.user.email || '',
    details: `Created compliance record: ${title}`,
    source: 'User',
  });

  return normalizeCompliance({
    Id: created?.Id || created?.ID || '',
    ...created,
    Title: title,
  });
}

export async function updateComplianceRecord(
  context: WebPartContext,
  itemId: string | number,
  changes: Partial<GemsComplianceRecord>,
  auditDetails?: string
): Promise<void> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  const safeId = String(itemId || '').trim();
  if (!safeId) return;

  const payload: Record<string, any> = {};
  const fields = complianceQueryFields().filter(f => f !== 'Id');
  for (const field of fields) {
    if (field in changes) {
      payload[field] = changes[field as keyof GemsComplianceRecord];
    }
  }
  if (!Object.keys(payload).length) return;

  await fetch(`${listUrl(webUrl, GEMS_LISTS_NEW.compliance)}/items(${safeId})`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify(payload),
  });

  await writeAuditLog(context, {
    entityType: GEMS_LISTS_NEW.compliance,
    entityId: safeId,
    action: 'Updated',
    userName: context.pageContext.user.displayName,
    userEmail: context.pageContext.user.email || '',
    details: auditDetails || `Updated compliance record fields: ${Object.keys(payload).join(', ')}`,
    source: 'User',
  });
}

export async function deleteComplianceRecord(context: WebPartContext, itemId: string | number): Promise<void> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  const safeId = String(itemId || '').trim();
  if (!safeId) return;

  await deleteListItem(webUrl, digest, GEMS_LISTS_NEW.compliance, safeId);

  await writeAuditLog(context, {
    entityType: GEMS_LISTS_NEW.compliance,
    entityId: safeId,
    action: 'Deleted',
    userName: context.pageContext.user.displayName,
    userEmail: context.pageContext.user.email || '',
    details: 'Deleted compliance record',
    source: 'User',
  });
}

// --- Attachment / Document Upload ---

export async function uploadComplianceAttachment(
  context: WebPartContext,
  itemId: string | number,
  file: File
): Promise<{ fileName: string; serverRelativeUrl: string }> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  const safeId = String(itemId || '').trim();
  if (!safeId) throw new Error('Item ID is required');

  const endpoint = `${listUrl(webUrl, GEMS_LISTS_NEW.compliance)}/items(${safeId})/AttachmentFiles/add(FileName='${encodeURIComponent(file.name)}')`;

  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
    },
    body: file,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to upload attachment: ${errText}`);
  }

  const result = await response.json();

  // Update DocumentsJson to include the new attachment
  const currentRecord = await getComplianceRecords(context, `Id eq ${safeId}`);
  const record = currentRecord[0];
  let docs: Array<{ url: string; name: string; uploadedAt: string }> = [];
  try { docs = JSON.parse(record?.DocumentsJson || '[]'); } catch { docs = []; }
  docs.push({
    url: result.ServerRelativeUrl || '',
    name: file.name,
    uploadedAt: new Date().toISOString(),
  });
  await updateComplianceRecord(context, safeId, { DocumentsJson: JSON.stringify(docs) } as any, `Uploaded attachment: ${file.name}`);

  const serverUrl = webUrl.replace(/\/sites\/.*$/i, '');
  const fullUrl = result.ServerRelativeUrl ? `${serverUrl}${result.ServerRelativeUrl}` : '';
  return { fileName: file.name, serverRelativeUrl: fullUrl };
}

export async function getComplianceAttachments(context: WebPartContext, itemId: string | number): Promise<Array<{ fileName: string; serverRelativeUrl: string }>> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  const safeId = String(itemId || '').trim();
  if (!safeId) return [];

  const endpoint = `${listUrl(webUrl, GEMS_LISTS_NEW.compliance)}/items(${safeId})/AttachmentFiles`;
  const response = await fetch(endpoint, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json;odata=nometadata', 'X-RequestDigest': digest },
  });

  if (!response.ok) return [];
  const data = await response.json();
  const serverUrl = webUrl.replace(/\/sites\/.*$/i, '');
  return (data.value || []).map((a: any) => ({
    fileName: a.FileName,
    serverRelativeUrl: a.ServerRelativeUrl ? `${serverUrl}${a.ServerRelativeUrl}` : '',
  }));
}

// --- Actions CRUD ---

export async function getActionRecords(context: WebPartContext, filter?: string): Promise<GemsActionRecord[]> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const url = buildListQuery(webUrl, GEMS_LISTS_NEW.actions, actionQueryFields(), filter, 500, 'DueDate asc');
  return getItems(webUrl, url, normalizeAction);
}

export async function getActionsByEntity(context: WebPartContext, entityType: string, entityId: string): Promise<GemsActionRecord[]> {
  const safeId = String(entityId || '').trim().replace(/'/g, "''");
  const safeType = String(entityType || '').trim().replace(/'/g, "''");
  if (!safeId) return [];
  return getActionRecords(context, `EntityType eq '${safeType}' and EntityId eq '${safeId}'`);
}

export async function getOpenActions(context: WebPartContext): Promise<GemsActionRecord[]> {
  return getActionRecords(context, "Status ne 'Completed' and Status ne 'Cancelled'");
}

export async function createActionRecord(
  context: WebPartContext,
  data: {
    entityType: string;
    entityId: string;
    entityName?: string;
    actionType: string;
    priority: string;
    status?: string;
    dueDate?: string;
    assignedTo?: string;
    description?: string;
    source?: string;
    sourceId?: string;
  }
): Promise<GemsActionRecord> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  await ensureGemsRuntimeReady(webUrl, digest);

  const title = `${data.actionType} - ${data.entityName || data.entityId}`.trim();
  const now = new Date().toISOString();
  const created = await ensureListItem(webUrl, digest, GEMS_LISTS_NEW.actions, {
    Title: title,
    EntityType: String(data.entityType),
    EntityId: String(data.entityId),
    EntityName: String(data.entityName || ''),
    ActionType: String(data.actionType),
    Priority: String(data.priority),
    Status: String(data.status || 'Open'),
    DueDate: String(data.dueDate || ''),
    CompletedDate: '',
    AssignedTo: String(data.assignedTo || ''),
    Description: String(data.description || ''),
    Source: String(data.source || ''),
    SourceId: String(data.sourceId || ''),
    Outcome: '',
    CreatedBy: context.pageContext.user.displayName,
    CreatedAt: now.split('T')[0],
  });

  await writeAuditLog(context, {
    entityType: GEMS_LISTS_NEW.actions,
    entityId: String(created?.Id || created?.ID || ''),
    action: 'Created',
    userName: context.pageContext.user.displayName,
    userEmail: context.pageContext.user.email || '',
    details: `Created action: ${title}`,
    source: 'User',
  });

  return normalizeAction({
    Id: created?.Id || created?.ID || '',
    ...created,
    Title: title,
  });
}

export async function updateActionRecord(
  context: WebPartContext,
  itemId: string | number,
  changes: Partial<GemsActionRecord>,
  auditDetails?: string
): Promise<void> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  const safeId = String(itemId || '').trim();
  if (!safeId) return;

  const payload: Record<string, any> = {};
  const fields = actionQueryFields().filter(f => f !== 'Id');
  for (const field of fields) {
    if (field in changes) {
      payload[field] = changes[field as keyof GemsActionRecord];
    }
  }
  if (!Object.keys(payload).length) return;

  await fetch(`${listUrl(webUrl, GEMS_LISTS_NEW.actions)}/items(${safeId})`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify(payload),
  });

  await writeAuditLog(context, {
    entityType: GEMS_LISTS_NEW.actions,
    entityId: safeId,
    action: 'Updated',
    userName: context.pageContext.user.displayName,
    userEmail: context.pageContext.user.email || '',
    details: auditDetails || `Updated action fields: ${Object.keys(payload).join(', ')}`,
    source: 'User',
  });
}

export async function completeActionRecord(context: WebPartContext, itemId: string | number, outcome?: string): Promise<void> {
  await updateActionRecord(context, itemId, {
    Status: 'Completed',
    CompletedDate: new Date().toISOString().split('T')[0],
    Outcome: outcome || '',
  }, `Completed action: ${outcome || 'Marked done'}`);
}

export async function deleteActionRecord(context: WebPartContext, itemId: string | number): Promise<void> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  const safeId = String(itemId || '').trim();
  if (!safeId) return;

  await deleteListItem(webUrl, digest, GEMS_LISTS_NEW.actions, safeId);

  await writeAuditLog(context, {
    entityType: GEMS_LISTS_NEW.actions,
    entityId: safeId,
    action: 'Deleted',
    userName: context.pageContext.user.displayName,
    userEmail: context.pageContext.user.email || '',
    details: 'Deleted action record',
    source: 'User',
  });
}

// --- Email Notification (for UC-01 rejection alerts) ---

export async function sendClassificationNotification(
  context: WebPartContext,
  data: {
    employeeEmail: string;
    employeeName: string;
    stakeholderName: string;
    previousCategory: string;
    newCategory: string;
    reviewedBy: string;
  }
): Promise<void> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl).catch(() => '');
  if (!digest) return;

  const subject = `GEMS: Interaction reclassification for ${data.stakeholderName}`;
  const body = `Dear ${data.employeeName},

Your interaction with ${data.stakeholderName} has been reviewed by ${data.reviewedBy}.

Previous classification: ${data.previousCategory}
New classification: ${data.newCategory}

Please log in to GEMS to view the updated record.

Best regards,
GEMS Platform`;

  try {
    // Attempt to send via SharePoint SendEmail API
    await fetch(`${webUrl}/_api/SP.Utilities.Utility.SendEmail`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'X-RequestDigest': digest,
      },
      body: JSON.stringify({
        properties: {
          __metadata: { type: 'SP.Utilities.EmailProperties' },
          From: context.pageContext.user.email || '',
          To: { results: [data.employeeEmail] },
          Subject: subject,
          Body: body,
        },
      }),
    }).catch(() => {
      // Email sending is best-effort; the audit log will still record the event
    });

    // Also log the notification event in the audit trail
    await writeAuditLog(context, {
      entityType: 'Notification',
      entityId: `reclass-${data.stakeholderName}-${Date.now()}`,
      action: 'EmailSent',
      userName: data.reviewedBy,
      userEmail: context.pageContext.user.email || '',
      details: JSON.stringify({
        title: 'Classification Rejected',
        message: `Interaction reclassified from ${data.previousCategory} to ${data.newCategory} for ${data.stakeholderName}`,
        priority: 'normal',
        to: data.employeeEmail,
      }),
      source: 'System',
    });
  } catch {
    // Best effort — do not throw
  }
}

// --- Audit Log ---

export async function writeAuditLog(
  context: WebPartContext,
  data: {
    entityType: string;
    entityId: string;
    action: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    userName: string;
    userEmail?: string;
    details?: string;
    source?: string;
  }
): Promise<void> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  try {
    await ensureGemsRuntimeReady(webUrl, digest);
  } catch {
    // Best effort — provisioning may already be done
  }

  const now = new Date().toISOString();
  await ensureListItem(webUrl, digest, GEMS_LISTS_NEW.auditLog, {
    Title: `${data.action} - ${data.entityType}[${data.entityId}]`,
    EntityType: String(data.entityType),
    EntityId: String(data.entityId),
    Action: String(data.action),
    FieldName: String(data.fieldName || ''),
    OldValue: String(data.oldValue || ''),
    NewValue: String(data.newValue || ''),
    UserName: String(data.userName),
    UserEmail: String(data.userEmail || ''),
    Timestamp: data.action === 'Created' ? now.split('T')[0] : now.split('T')[0],
    Source: String(data.source || 'GEMS'),
    Details: String(data.details || ''),
  }).catch((): undefined => undefined);
}

export async function getAuditLogs(context: WebPartContext, filter?: string): Promise<GemsAuditLogRecord[]> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const url = buildListQuery(webUrl, GEMS_LISTS_NEW.auditLog, auditLogQueryFields(), filter, 200, 'Timestamp desc');
  return getItems(webUrl, url, normalizeAuditLog);
}

export async function getAuditLogsByEntity(context: WebPartContext, entityType: string, entityId: string): Promise<GemsAuditLogRecord[]> {
  const safeId = String(entityId || '').trim().replace(/'/g, "''");
  const safeType = String(entityType || '').trim().replace(/'/g, "''");
  if (!safeId) return [];
  return getAuditLogs(context, `EntityType eq '${safeType}' and EntityId eq '${safeId}'`);
}

// --- Summary helpers ---

export interface GemsOperationalSummary {
  totalCompliance: number;
  expiredCompliance: number;
  expiringSoonCompliance: number;
  activeCompliance: number;
  pendingActions: number;
  overdueActions: number;
  dueSoonActions: number;
  completedActions: number;
}

export async function getGemsOperationalSummary(context: WebPartContext): Promise<GemsOperationalSummary> {
  const webUrl = context.pageContext.web.absoluteUrl;

  const complianceUrl = buildListQuery(webUrl, GEMS_LISTS_NEW.compliance, ['Id', 'Status', 'ExpiryDate'], undefined, 500, 'Id desc');
  const actionsUrl = buildListQuery(webUrl, GEMS_LISTS_NEW.actions, ['Id', 'Status', 'DueDate'], undefined, 500, 'Id desc');

  const [complianceData, actionsData] = await Promise.all([
    getJson(webUrl, complianceUrl).catch((): { value: any[] } => ({ value: [] })),
    getJson(webUrl, actionsUrl).catch((): { value: any[] } => ({ value: [] })),
  ]);

  const complianceItems = complianceData.value || [];
  const actionItems = actionsData.value || [];
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    totalCompliance: complianceItems.length,
    expiredCompliance: complianceItems.filter((i: any) => String(i.Status || '') === 'Expired').length,
    expiringSoonCompliance: complianceItems.filter((i: any) => {
      const s = String(i.Status || '');
      if (s === 'Expired' || s === 'Cancelled') return false;
      const expiry = i.ExpiryDate ? new Date(i.ExpiryDate) : null;
      return expiry && expiry <= thirtyDaysFromNow && expiry >= today;
    }).length,
    activeCompliance: complianceItems.filter((i: any) => String(i.Status || '') === 'Active').length,
    pendingActions: actionItems.filter((i: any) => String(i.Status || '') !== 'Completed' && String(i.Status || '') !== 'Cancelled').length,
    overdueActions: actionItems.filter((i: any) => {
      const s = String(i.Status || '');
      if (s === 'Completed' || s === 'Cancelled') return false;
      const due = i.DueDate ? new Date(i.DueDate) : null;
      return due && due < today;
    }).length,
    dueSoonActions: actionItems.filter((i: any) => {
      const s = String(i.Status || '');
      if (s === 'Completed' || s === 'Cancelled') return false;
      const due = i.DueDate ? new Date(i.DueDate) : null;
      return due && due >= today && due <= thirtyDaysFromNow;
    }).length,
    completedActions: actionItems.filter((i: any) => String(i.Status || '') === 'Completed').length,
  };
}

// --- Notifications ---

export interface GemsNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  priority: string;
  read: boolean;
}

export async function getCurrentUserNotifications(context: WebPartContext): Promise<GemsNotification[]> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const userEmail = context.pageContext.user.email || '';
  const userName = context.pageContext.user.displayName || '';
  const filter = `UserName eq '${userName.replace(/'/g, "''")}' or UserEmail eq '${userEmail.replace(/'/g, "''")}'`;
  const records = await getAuditLogs(context, `${filter}&$orderby=Timestamp desc&$top=50`).catch(() => [] as GemsAuditLogRecord[]);
  return records.map((r) => {
    let parsed: any = {};
    try { parsed = JSON.parse(r.Details || '{}'); } catch {}
    return {
      id: r.ID,
      title: parsed.title || r.Action || 'Notification',
      message: parsed.message || r.Details || '',
      type: r.Action,
      entityType: r.EntityType,
      entityId: r.EntityId,
      timestamp: r.Timestamp,
      priority: parsed.priority || 'normal',
      read: false,
    };
  });
}

// --- Stakeholder Health Scoring ---

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

export async function getStakeholderHealth(context: WebPartContext, clients: any[], interactions: any[], comms: any[]): Promise<StakeholderHealth[]> {
  const today = new Date();
  return clients.map((client) => {
    const clientId = String(client.ID || '');
    const clientInteractions = interactions.filter((i: any) => String(i.ClientID) === clientId);
    const clientComms = comms.filter((c: any) => String(c.ClientID) === clientId);
    const lastInteraction = clientInteractions.length > 0
      ? Math.max(...clientInteractions.map((i: any) => i.LoggedAt ? new Date(i.LoggedAt).getTime() : 0))
      : 0;
    const lastComm = clientComms.length > 0
      ? Math.max(...clientComms.map((c: any) => c.CommunicationDate ? new Date(c.CommunicationDate).getTime() : 0))
      : 0;
    const daysSinceLastInteraction = lastInteraction > 0 ? Math.round((today.getTime() - lastInteraction) / 86400000) : 999;
    const daysSinceLastComm = lastComm > 0 ? Math.round((today.getTime() - lastComm) / 86400000) : 999;
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
      totalPoints: clientInteractions.reduce((s: number, i: any) => s + Number(i.Points || 0), 0),
      healthScore: Math.max(0, Math.min(100, healthScore)),
      healthLabel,
    };
  });
}
