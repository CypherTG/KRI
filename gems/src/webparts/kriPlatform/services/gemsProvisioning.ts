import {
  listUrl,
  getRequestDigest,
  getJson,
  listExists,
  createList,
  waitForListAvailability,
  getFieldMap,
  ensureField,
  ensureListWithFields,
  fieldXmlText,
  fieldXmlNote,
  fieldXmlChoice,
  fieldXmlBoolean,
  fieldXmlDate,
  fieldXmlUrl,
} from './sharepointProvisioning';

type ProvisionStep = {
  title: string;
  created: boolean;
  fieldsCreated: string[];
};

export const GEMS_LISTS_NEW = {
  interactions: 'GEMS_Interactions',
  compliance: 'GEMS_Compliance',
  actions: 'GEMS_Actions',
  auditLog: 'GEMS_AuditLog',
};

function complianceFields() {
  return [
    { name: 'EntityType', xml: fieldXmlChoice('EntityType', 'Entity Type', ['Stakeholder', 'Agency'], true) },
    { name: 'EntityId', xml: fieldXmlText('EntityId', 'Entity ID', true) },
    { name: 'EntityName', xml: fieldXmlText('EntityName', 'Entity Name', false) },
    { name: 'ComplianceType', xml: fieldXmlChoice('ComplianceType', 'Compliance Type', ['Permit', 'License', 'Obligation', 'Certificate', 'Filing', 'Registration'], true) },
    { name: 'Status', xml: fieldXmlChoice('Status', 'Status', ['Active', 'Expired', 'Pending', 'Cancelled', 'ExpiringSoon', 'UnderReview'], true) },
    { name: 'IssueDate', xml: fieldXmlDate('IssueDate', 'Issue Date', false) },
    { name: 'ExpiryDate', xml: fieldXmlDate('ExpiryDate', 'Expiry Date', false) },
    { name: 'RenewalDate', xml: fieldXmlDate('RenewalDate', 'Renewal Date', false) },
    { name: 'GoverningBody', xml: fieldXmlText('GoverningBody', 'Governing Body', false) },
    { name: 'ReferenceNumber', xml: fieldXmlText('ReferenceNumber', 'Reference Number', false) },
    { name: 'Description', xml: fieldXmlNote('Description', 'Description', false, false) },
    { name: 'Notes', xml: fieldXmlNote('Notes', 'Notes', false, false) },
    { name: 'AssignedTo', xml: fieldXmlText('AssignedTo', 'Assigned To', false) },
    { name: 'DocumentsJson', xml: fieldXmlNote('DocumentsJson', 'Documents JSON', false, false) },
    { name: 'LastCheckedDate', xml: fieldXmlDate('LastCheckedDate', 'Last Checked Date', false) },
    { name: 'AlertSent', xml: fieldXmlBoolean('AlertSent', 'Alert Sent', false) },
  ];
}

function actionFields() {
  return [
    { name: 'EntityType', xml: fieldXmlChoice('EntityType', 'Entity Type', ['Stakeholder', 'Agency', 'Interaction', 'Compliance', 'System'], true) },
    { name: 'EntityId', xml: fieldXmlText('EntityId', 'Entity ID', true) },
    { name: 'EntityName', xml: fieldXmlText('EntityName', 'Entity Name', false) },
    { name: 'ActionType', xml: fieldXmlChoice('ActionType', 'Action Type', ['FollowUp', 'Task', 'Reminder', 'Approval', 'Review', 'Notification'], true) },
    { name: 'Priority', xml: fieldXmlChoice('Priority', 'Priority', ['High', 'Medium', 'Low'], true) },
    { name: 'Status', xml: fieldXmlChoice('Status', 'Status', ['Open', 'InProgress', 'Completed', 'Cancelled', 'Deferred'], true) },
    { name: 'DueDate', xml: fieldXmlDate('DueDate', 'Due Date', false) },
    { name: 'CompletedDate', xml: fieldXmlDate('CompletedDate', 'Completed Date', false) },
    { name: 'AssignedTo', xml: fieldXmlText('AssignedTo', 'Assigned To', false) },
    { name: 'Description', xml: fieldXmlNote('Description', 'Description', false, false) },
    { name: 'Source', xml: fieldXmlText('Source', 'Source', false) },
    { name: 'SourceId', xml: fieldXmlText('SourceId', 'Source ID', false) },
    { name: 'Outcome', xml: fieldXmlText('Outcome', 'Outcome', false) },
    { name: 'CreatedBy', xml: fieldXmlText('CreatedBy', 'Created By', true) },
    { name: 'CreatedAt', xml: fieldXmlDate('CreatedAt', 'Created At', false) },
  ];
}

function auditLogFields() {
  return [
    { name: 'EntityType', xml: fieldXmlText('EntityType', 'Entity Type', true) },
    { name: 'EntityId', xml: fieldXmlText('EntityId', 'Entity ID', true) },
    { name: 'Action', xml: fieldXmlChoice('Action', 'Action', ['Created', 'Updated', 'Deleted', 'Viewed', 'Exported', 'Approved', 'Rejected'], true) },
    { name: 'FieldName', xml: fieldXmlText('FieldName', 'Field Name', false) },
    { name: 'OldValue', xml: fieldXmlNote('OldValue', 'Old Value', false, false) },
    { name: 'NewValue', xml: fieldXmlNote('NewValue', 'New Value', false, false) },
    { name: 'UserName', xml: fieldXmlText('UserName', 'User Name', true) },
    { name: 'UserEmail', xml: fieldXmlText('UserEmail', 'User Email', false) },
    { name: 'Timestamp', xml: fieldXmlDate('Timestamp', 'Timestamp', true) },
    { name: 'Source', xml: fieldXmlText('Source', 'Source', false) },
    { name: 'Details', xml: fieldXmlNote('Details', 'Details', false, false) },
  ];
}

async function ensureGemsComplianceReady(webUrl: string, digest: string): Promise<void> {
  await ensureListWithFields(
    webUrl,
    digest,
    GEMS_LISTS_NEW.compliance,
    'GEMS compliance records — permits, licences, obligations, and regulatory filings with expiry tracking.',
    complianceFields()
  );
}

async function ensureGemsActionsReady(webUrl: string, digest: string): Promise<void> {
  await ensureListWithFields(
    webUrl,
    digest,
    GEMS_LISTS_NEW.actions,
    'GEMS action items and follow-up tasks linked to stakeholders, agencies, interactions, and compliance records.',
    actionFields()
  );
}

async function ensureGemsAuditLogReady(webUrl: string, digest: string): Promise<void> {
  await ensureListWithFields(
    webUrl,
    digest,
    GEMS_LISTS_NEW.auditLog,
    'GEMS universal audit trail — tracks all create, update, delete, view, and export events across GEMS entities.',
    auditLogFields()
  );
}

function interactionFields() {
  return [
    { name: 'ClientId', xml: fieldXmlText('ClientId', 'Client ID', true) },
    { name: 'ClientID', xml: fieldXmlText('ClientID', 'Client ID', true) },
    { name: 'ClientName', xml: fieldXmlText('ClientName', 'Client Name', true) },
    { name: 'CompanyKey', xml: fieldXmlText('CompanyKey', 'Company Key', false) },
    { name: 'CompanyName', xml: fieldXmlText('CompanyName', 'Company Name', false) },
    { name: 'Agency', xml: fieldXmlText('Agency', 'Agency', false) },
    { name: 'BusinessArm', xml: fieldXmlChoice('BusinessArm', 'Business Arm', ['INTERKONSTRUCT', 'KCC', 'PMT7'], false) },
    { name: 'InteractionType', xml: fieldXmlChoice('InteractionType', 'Interaction Type', ['Meeting', 'Call', 'Email', 'Note'], true) },
    { name: 'Category', xml: fieldXmlChoice('Category', 'Category', ['Crown Jewel', 'Pearl', 'Coral', 'Ruby'], true) },
    { name: 'FinalClassification', xml: fieldXmlText('FinalClassification', 'Final Classification', false) },
    { name: 'InfluencePercent', xml: fieldXmlText('InfluencePercent', 'Influence Percent', false) },
    { name: 'Points', xml: fieldXmlText('Points', 'Points', true) },
    { name: 'Notes', xml: fieldXmlNote('Notes', 'Notes', false, false) },
    { name: 'Justification', xml: fieldXmlNote('Justification', 'Justification', false, false) },
    { name: 'ReviewStatus', xml: fieldXmlChoice('ReviewStatus', 'Review Status', ['Submitted', 'Pending Review', 'Validated', 'Rejected'], false) },
    { name: 'WeekStart', xml: fieldXmlDate('WeekStart', 'Week Start', false) },
    { name: 'ReportingMonth', xml: fieldXmlText('ReportingMonth', 'Reporting Month', false) },
    { name: 'LoggedBy', xml: fieldXmlText('LoggedBy', 'Logged By', true) },
    { name: 'LoggedAt', xml: fieldXmlDate('LoggedAt', 'Logged At', true) },
    { name: 'TargetUser', xml: fieldXmlText('TargetUser', 'Target User', true) },
    { name: 'TargetUserId', xml: fieldXmlText('TargetUserId', 'Target User Id', false) },
    { name: 'KRIClassification', xml: fieldXmlText('KRIClassification', 'KRI Classification', false) },
    { name: 'ExecutiveInvolvementRequested', xml: fieldXmlBoolean('ExecutiveInvolvementRequested', 'Executive Involvement Requested', true) },
    { name: 'ExecutiveMonthlyPointsAtLog', xml: fieldXmlText('ExecutiveMonthlyPointsAtLog', 'Executive Monthly Points At Log', false) },
    { name: 'FollowUpRequired', xml: fieldXmlBoolean('FollowUpRequired', 'Follow Up Required', true) },
    { name: 'FollowUpDate', xml: fieldXmlDate('FollowUpDate', 'Follow Up Date', false) },
    { name: 'ScheduledDate', xml: fieldXmlDate('ScheduledDate', 'Scheduled Date', false) },
  ];
}

export async function ensureGemsRuntimeReady(webUrl: string, digest: string): Promise<void> {
  await ensureGemsComplianceReady(webUrl, digest);
  await ensureGemsActionsReady(webUrl, digest);
  await ensureGemsAuditLogReady(webUrl, digest);
}

export async function provisionGemsLists(webUrl: string, digest: string): Promise<ProvisionStep[]> {
  const steps: ProvisionStep[] = [];

  const ensure = async (title: string, description: string, fields: Array<{ name: string; xml: string }>): Promise<ProvisionStep> => {
    try {
      return await ensureListWithFields(webUrl, digest, title, description, fields);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[provisionGemsLists] Skipping "${title}": ${message}`);
      return { title, created: false, fieldsCreated: [] };
    }
  };

  steps.push(await ensure(GEMS_LISTS_NEW.interactions, 'GEMS interaction intelligence, category scoring, and meeting notes.', interactionFields()));
  steps.push(await ensure(GEMS_LISTS_NEW.compliance, 'GEMS compliance records — permits, licences, obligations, and regulatory filings with expiry tracking.', complianceFields()));
  steps.push(await ensure(GEMS_LISTS_NEW.actions, 'GEMS action items and follow-up tasks linked to stakeholders, agencies, interactions, and compliance records.', actionFields()));
  steps.push(await ensure(GEMS_LISTS_NEW.auditLog, 'GEMS universal audit trail — tracks all create, update, delete, view, and export events across GEMS entities.', auditLogFields()));

  return steps;
}
