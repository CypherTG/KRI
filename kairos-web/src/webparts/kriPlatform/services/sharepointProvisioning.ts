import { KriContext, apiRequest, fileToBase64 } from '../../../types/kri';
import { IClient, getClients, isManagementAdminUser } from './graphApi';

/**
 * KAIROS provisioning layer — 1:1 port of `sharepointProvisioning.ts`.
 *
 * On SharePoint this file did two jobs: it *created* lists, columns, and a
 * document library through the REST API, and it read/wrote the data in them.
 * The schema now lives in `db/schema.sql` and the server creates everything it
 * needs, so this module is purely data access again. The exported function
 * names and shapes are unchanged so every call site keeps working.
 */

export interface CompanyAcumenRecord {
  ID: string;
  Title: string;
  CompanyKey: string;
  CompanyName: string;
  FileName: string;
  FileUrl: string;
  BlobPath?: string;
  ContentType?: string;
  SizeBytes?: number;
  Notes: string;
  UploadedBy: string;
  UploadedAt: string;
}

export interface BiodataRecord {
  ID: string;
  Title: string;
  contact_id: string;
  full_name: string;
  preferred_name: string;
  current_company?: string;
  job_title?: string;
  salutation: string;
  gender: string;
  date_of_birth: string;
  profile_photo_url: string;
  photo_blob_path?: string;
  record_status: string;
  record_owner: any;
  nationality: string;
  birth_country: string;
  birth_state: string;
  hometown: string;
  ethnicity: string;
  religion: string;
  languages_spoken: string[] | string;
  education: string[] | string;
  certifications: string[] | string;
  work_history: string[] | string;
  board_positions: string[] | string;
  preferred_channels: string[] | string;
  preferred_contact_time: string;
  preferred_meeting_format: string;
  communication_formality: string;
  gatekeeper_name: string;
  gatekeeper_phone: string;
  comms_notes: string;
  personal_interests: string[] | string;
  motivators: string[] | string;
  decision_making_style: string;
  referral_source: string;
  known_associates: string[] | string;
  sensitivity_flags: string[] | string;
  account_notes: string;
  consent_email: boolean;
  consent_sms: boolean;
  consent_date: string;
  data_source: string;
  created_date: string;
  last_modified_date: string;
  deletion_requested: boolean;
}

export type KairosAccessRequestStatus = 'Pending' | 'Approved' | 'Declined' | 'Expired';

export interface KairosContactAccessRequest {
  ID: string;
  Title: string;
  ClientID: string;
  ClientName: string;
  CompanyName: string;
  RequesterKey: string;
  RequesterName: string;
  RequesterEmail: string;
  OwnerKey: string;
  OwnerName: string;
  Status: KairosAccessRequestStatus;
  Reason: string;
  RequestedAt: string;
  RespondedAt: string;
  ExpiresAt: string;
  ResponseBy: string;
}

export interface ProvisionStep {
  title: string;
  created: boolean;
  fieldsCreated: string[];
}

export interface SeedStep {
  title: string;
  created: number;
  updated: number;
}

// ─── Company registry ─────────────────────────────────────────────────────────

export async function upsertCompanyRegistryRecord(
  context: KriContext,
  companyKey: string,
  companyName: string,
  _contactCount = 0,
  summary = '',
): Promise<void> {
  await apiRequest('/companies', {
    method: 'POST',
    body: { companyKey, companyName, summary },
  });
}

export async function getCompanyLookupOptions(context: KriContext): Promise<string[]> {
  const result = await apiRequest<{ companies: string[] }>('/lookups');
  return result.companies || [];
}

export async function getJobTitleLookupOptions(context: KriContext): Promise<string[]> {
  const result = await apiRequest<{ jobTitles: string[] }>('/lookups');
  return result.jobTitles || [];
}

export async function getProjectLookupOptions(context: KriContext): Promise<string[]> {
  const result = await apiRequest<{ projects: string[] }>('/lookups');
  return result.projects || [];
}

function normalizeLabel(value: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function dedupeAlphabetical(values: string[]): string[] {
  const seen = new Map<string, string>();
  values.forEach((value) => {
    const label = normalizeLabel(value);
    const key = label.toLowerCase();
    if (!label || !key || seen.has(key)) return;
    seen.set(key, label);
  });
  return Array.from(seen.values()).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

/**
 * The SharePoint build pushed every distinct company / project / job title
 * from the contact registry into canonical lookup lists, and Settings exposed
 * a "provision lists" button. That is now a server migration concern, but the
 * lookup pickers still want the tables populated, so we seed them on demand.
 */
export async function seedLookupListsFromCurrentRegistry(context: KriContext): Promise<SeedStep[]> {
  const clients = await getClients(context).catch(() => [] as IClient[]);
  const companies = dedupeAlphabetical(clients.map((client) => client.CompanyName));
  const projects = dedupeAlphabetical(clients.map((client) => client.ProjectName));
  const jobTitles = dedupeAlphabetical(clients.map((client) => client.JobTitle));

  const steps: SeedStep[] = [];

  await apiRequest('/lookups', { method: 'POST', body: { list: 'projects', values: projects } });
  steps.push({ title: 'KRI_Projects', created: projects.length, updated: 0 });

  await apiRequest('/lookups', { method: 'POST', body: { list: 'job_titles', values: jobTitles } });
  steps.push({ title: 'KRI_JobTitles', created: jobTitles.length, updated: 0 });

  steps.push({ title: 'KRI_Companies', created: companies.length, updated: 0 });
  return steps;
}

// ─── Company acumen documents ─────────────────────────────────────────────────

export async function saveCompanyAcumenFile(
  context: KriContext,
  companyKey: string,
  companyName: string,
  file: File,
): Promise<void> {
  const isAdmin = Boolean((context?.session as any)?.isAdmin) || isManagementAdminUser(context?.session as any);
  if (!isAdmin) {
    // Uploading a company brief is an administrative action; the server
    // enforces this too, but failing early gives a better message.
    throw new Error('Only administrators can upload company documents.');
  }
  const base64 = await fileToBase64(file);
  await apiRequest('/acumen', {
    method: 'POST',
    body: {
      companyKey,
      companyName,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      base64,
    },
  });
}

export async function getCompanyAcumenRecords(
  context: KriContext,
  companyKey: string,
): Promise<CompanyAcumenRecord[]> {
  const result = await apiRequest<{ records: CompanyAcumenRecord[] }>('/acumen', { query: { companyKey } });
  return result.records || [];
}

// ─── Biodata ──────────────────────────────────────────────────────────────────

export async function getClientBiodataRecord(
  context: KriContext,
  contactId: string,
): Promise<BiodataRecord | null> {
  const result = await apiRequest<{ biodata: BiodataRecord | null }>('/biodata', { query: { contactId } });
  return result.biodata;
}

export async function saveClientBiodataRecord(
  context: KriContext,
  contactId: string,
  payload: Partial<BiodataRecord>,
  profilePhotoFile?: File | null,
): Promise<BiodataRecord> {
  let result: { biodata: BiodataRecord };

  if (profilePhotoFile) {
    const base64 = await fileToBase64(profilePhotoFile);
    result = await apiRequest<{ biodata: BiodataRecord }>('/biodata-photo', {
      method: 'POST',
      body: {
        contactId,
        fileName: profilePhotoFile.name,
        contentType: profilePhotoFile.type || 'image/jpeg',
        base64,
      },
    });
  }

  result = await apiRequest<{ biodata: BiodataRecord }>('/biodata', {
    method: 'POST',
    body: { ...payload, contact_id: contactId },
  });

  return result.biodata;
}

export async function removeClientBiodataPhoto(context: KriContext, contactId: string): Promise<void> {
  await apiRequest('/biodata-photo', { method: 'DELETE', query: { contactId } });
}

/**
 * `NeedsOpportunity` is a plain column on the contact row, created up-front by
 * the schema. This used to add the column on demand through the REST API, so
 * it is now a no-op that exists purely for call-site compatibility.
 */
export async function ensureKairosClientManagementFields(_context: KriContext): Promise<void> {
  return undefined;
}

export async function provisionGemsLists(_context: KriContext): Promise<ProvisionStep[]> {
  throw new Error('GEMS is not part of this deployment. KAIROS is the only application here for now.');
}

// ─── Contact access requests ──────────────────────────────────────────────────

export async function getContactAccessRequestsForUser(
  context: KriContext,
): Promise<KairosContactAccessRequest[]> {
  const result = await apiRequest<{ requests: KairosContactAccessRequest[] }>('/access-requests', {
    query: { scope: 'mine' },
  });
  return result.requests || [];
}

export async function getContactAccessRequestsForClient(
  context: KriContext,
  clientId: string,
): Promise<KairosContactAccessRequest[]> {
  const result = await apiRequest<{ requests: KairosContactAccessRequest[] }>('/access-requests', {
    query: { scope: 'client', clientId },
  });
  return result.requests || [];
}

export async function getContactAccessRequestsForOwner(
  context: KriContext,
): Promise<KairosContactAccessRequest[]> {
  const result = await apiRequest<{ requests: KairosContactAccessRequest[] }>('/access-requests', {
    query: { scope: 'owner' },
  });
  return result.requests || [];
}

export async function requestContactAccess(
  context: KriContext,
  client: Partial<IClient>,
  reason = '',
): Promise<KairosContactAccessRequest> {
  const result = await apiRequest<{ request: KairosContactAccessRequest }>('/access-requests', {
    method: 'POST',
    body: { clientId: client.ID, reason },
  });
  return result.request;
}

export async function respondToContactAccessRequest(
  context: KriContext,
  requestId: string,
  status: Extract<KairosAccessRequestStatus, 'Approved' | 'Declined'>,
): Promise<void> {
  await apiRequest('/access-requests', { method: 'POST', query: { respond: 1 }, body: { id: requestId, status } });
}

// ─── Removed (kept as explicit no-ops for import compatibility) ──────────────

export const GEMS_LISTS = {
  compliance: 'GEMS_Compliance',
  actions: 'GEMS_Actions',
  auditLog: 'GEMS_AuditLog',
  interactions: 'GEMS_Interactions',
};
