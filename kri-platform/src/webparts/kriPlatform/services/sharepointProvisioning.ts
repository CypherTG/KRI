import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getClients, getCurrentSiteUser, IClient } from './graphApi';
import { resolveKriDataSiteUrl } from './siteConfig';

type ProvisionStep = {
  title: string;
  created: boolean;
  fieldsCreated: string[];
};

type SeedStep = {
  title: string;
  created: number;
  updated: number;
};

export type CompanyAcumenRecord = {
  ID: string;
  Title: string;
  CompanyKey: string;
  CompanyName: string;
  FileName: string;
  FileUrl: string;
  Notes: string;
  UploadedBy: string;
  UploadedAt: string;
  AttachmentFiles?: any;
};

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
  record_status: string;
  record_owner: any;
  nationality: string;
  birth_country: string;
  birth_state: string;
  hometown: string;
  ethnicity: string;
  religion: string;
  languages_spoken: string;
  education: string;
  certifications: string;
  work_history: string;
  board_positions: string;
  preferred_channels: string;
  preferred_contact_time: string;
  preferred_meeting_format: string;
  communication_formality: string;
  gatekeeper_name: string;
  gatekeeper_phone: string;
  comms_notes: string;
  personal_interests: string;
  motivators: string;
  decision_making_style: string;
  referral_source: string;
  known_associates: string;
  sensitivity_flags: string;
  account_notes: string;
  consent_email: boolean;
  consent_sms: boolean;
  consent_date: string;
  data_source: string;
  created_date: string;
  last_modified_date: string;
  deletion_requested: boolean;
}

const LISTS = {
  companies: 'KRI_Companies',
  projects: 'KRI_Projects',
  jobTitles: 'KRI_JobTitles',
  acumen: 'KRI_CompanyAcumen',
  biodata: 'KRI_Biodata',
  accessRequests: 'KRI_ContactAccessRequests',
};

function listUrl(webUrl: string, listName: string): string {
  return `${webUrl}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')`;
}

function getPageWebUrl(): string {
  if (typeof window === 'undefined') return '';
  const href = String(window.location.href || '').split('#')[0].split('?')[0];
  const siteMatch = href.match(/^(https?:\/\/[^/]+(?:\/(?:sites|personal)\/[^/]+))/i);
  if (siteMatch) return siteMatch[1].replace(/\/$/, '');
  const originMatch = href.match(/^(https?:\/\/[^/]+)/i);
  return originMatch ? originMatch[1].replace(/\/$/, '') : '';
}

function rewriteToAppContextSiteUrl(webUrl: string, url: string): string {
  const targetWebUrl = String(webUrl || '').replace(/\/$/, '');
  const currentWebUrl = getPageWebUrl();
  const safeUrl = String(url || '');
  if (!currentWebUrl || !targetWebUrl || !safeUrl.startsWith(targetWebUrl)) return safeUrl;
  const relative = safeUrl.slice(targetWebUrl.length).replace(/^\/+/, '');
  const [pathPart, queryPart] = relative.split('?');
  const apiPath = pathPart.replace(/^_api\//, '');
  const targetParam = `@target='${encodeURIComponent(targetWebUrl)}'`;
  const querySuffix = queryPart ? `&${queryPart}` : '';
  return `${currentWebUrl}/_api/SP.AppContextSite(@target)/${apiPath}?${targetParam}${querySuffix}`;
}

function requestAttempts(webUrl: string, url: string): string[] {
  const safeUrl = String(url || '');
  const rewritten = rewriteToAppContextSiteUrl(webUrl, safeUrl);
  // Deduplicate: if rewrite produced a different URL, try it first; also try original as fallback
  if (rewritten !== safeUrl) return [rewritten, safeUrl];
  return [safeUrl];
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function apiFetch(webUrl: string, url: string, options: RequestInit = {}): Promise<Response> {
  let lastError: unknown = null;
  for (const attempt of requestAttempts(webUrl, url)) {
    try {
      const response = await fetch(attempt, {
        credentials: 'include',
        ...options,
        headers: {
          Accept: 'application/json;odata=nometadata',
          ...(options.headers as Record<string, string> || {}),
        },
      });
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Request failed for ${url}`);
}

async function getRequestDigest(webUrl: string): Promise<string> {
  // For cross-site AppContextSite calls the digest MUST come from the hosting
  // site (the page the user's browser is on), not the remote data site.
  const hostingWebUrl = getPageWebUrl() || String(webUrl || '').replace(/\/$/, '');
  const response = await apiFetch(hostingWebUrl, `${hostingWebUrl}/_api/contextinfo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;odata=nometadata',
      'odata-version': '',
    },
  });
  if (!response.ok) throw new Error(`Could not obtain request digest (${response.status})`);
  const json = await response.json();
  return json?.FormDigestValue || json?.d?.GetContextWebInformation?.FormDigestValue || '';
}

async function getJson(webUrl: string, url: string): Promise<any> {
  const response = await apiFetch(webUrl, url, {
    headers: { 'odata-version': '' },
  });
  if (!response.ok) throw new Error(`GET failed (${response.status}) for ${url}`);
  return response.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listExists(webUrl: string, title: string): Promise<boolean> {
  try {
    const data = await getJson(webUrl, `${webUrl}/_api/web/lists?$select=Id,Title&$filter=Title eq '${encodeURIComponent(title)}'&$top=1`);
    return (data.value || []).length > 0;
  } catch {
    return false;
  }
}

async function verifyListExists(webUrl: string, title: string): Promise<boolean> {
  try {
    const data = await getJson(webUrl, `${webUrl}/_api/web/lists?$select=Id,Title,ItemCount&$filter=Title eq '${encodeURIComponent(title)}'&$top=1`);
    const list = (data.value || [])[0];
    if (!list) return false;
    return true;
  } catch {
    return false;
  }
}

async function waitForListAvailability(webUrl: string, title: string, attempts = 8, delayMs = 750): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await listExists(webUrl, title)) return;
    await sleep(delayMs * (attempt + 1));
  }
  throw new Error(`List "${title}" was not available after ${attempts} retries — SharePoint may be provisioning it asynchronously. Try again in a few seconds.`);
}

async function createList(webUrl: string, digest: string, title: string, description: string): Promise<boolean> {
  if (await listExists(webUrl, title)) return false;
  const response = await apiFetch(webUrl, `${webUrl}/_api/web/lists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
    },
    body: JSON.stringify({
      Title: title,
      Description: description,
      BaseTemplate: 100,
    }),
  });
  if (!response.ok && response.status !== 409) {
    const details = await response.text().catch(() => '');
    throw new Error(`Create list failed for ${title} (${response.status})${details ? `: ${details}` : ''}`);
  }
  return response.ok;
}

type SharePointFieldInfo = {
  InternalName: string;
  Title: string;
  TypeAsString: string;
};

async function getFieldMetadata(webUrl: string, title: string): Promise<SharePointFieldInfo[]> {
  try {
    const data = await getJson(webUrl, `${listUrl(webUrl, title)}/fields?$select=InternalName,Title,TypeAsString&$filter=Hidden eq false&$top=500`);
    return (data.value || []).map((field: any) => ({
      InternalName: String(field.InternalName || ''),
      Title: String(field.Title || ''),
      TypeAsString: String(field.TypeAsString || ''),
    })).filter((field: SharePointFieldInfo) => field.InternalName);
  } catch {
    return [];
  }
}

async function getFieldMap(webUrl: string, title: string): Promise<Record<string, string>> {
  const fields = await getFieldMetadata(webUrl, title);
  const map: Record<string, string> = {};
  fields.forEach((field) => {
    map[field.InternalName] = field.TypeAsString;
  });
  return map;
}

function fieldXmlText(name: string, displayName: string, required = false, maxLength = 255): string {
  return `<Field Type="Text" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" MaxLength="${maxLength}" />`;
}

function fieldXmlNote(name: string, displayName: string, required = false, richText = false): string {
  return `<Field Type="Note" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" NumLines="6" RichText="${richText ? 'TRUE' : 'FALSE'}" AppendOnly="FALSE" />`;
}

function fieldXmlChoice(name: string, displayName: string, choices: string[], required = false, multi = false): string {
  const choiceXml = choices.map((choice) => `<CHOICE>${escapeXml(choice)}</CHOICE>`).join('');
  return `<Field Type="${multi ? 'MultiChoice' : 'Choice'}" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}"><CHOICES>${choiceXml}</CHOICES></Field>`;
}

function fieldXmlBoolean(name: string, displayName: string, required = false): string {
  return `<Field Type="Boolean" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" />`;
}

function fieldXmlDate(name: string, displayName: string, required = false): string {
  return `<Field Type="DateTime" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" Format="DateOnly" />`;
}

function fieldXmlUrl(name: string, displayName: string, required = false): string {
  return `<Field Type="URL" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" Format="Hyperlink" />`;
}

function fieldXmlUser(name: string, displayName: string, required = false): string {
  return `<Field Type="User" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" List="UserInfo" UserSelectionMode="PeopleOnly" />`;
}

async function ensureField(webUrl: string, digest: string, listName: string, internalName: string, schemaXml: string, fieldMap: Record<string, string>): Promise<boolean> {
  if (fieldMap[internalName]) return false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await apiFetch(webUrl, `${listUrl(webUrl, listName)}/fields/CreateFieldAsXml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;odata=nometadata',
          'X-RequestDigest': digest,
        },
        body: JSON.stringify({
          parameters: {
            SchemaXml: schemaXml,
            Options: 0,
          },
        }),
      });
    } catch {
      console.warn(`[ensureField] Network error creating field ${listName}.${internalName} — skipped`);
      return false;
    }
    if (response.ok || response.status === 409) {
      return response.ok;
    }
    if (response.status === 404 && attempt < 3) {
      await waitForListAvailability(webUrl, listName, 2, 500);
      continue;
    }
    const details = await response.text().catch(() => '');
    console.warn(`[ensureField] Field ${listName}.${internalName} not created (${response.status}): ${details.slice(0, 300)}`);
    return false;
  }
  return false;
}

async function ensureListWithFields(
  webUrl: string,
  digest: string,
  title: string,
  description: string,
  fieldDefinitions: Array<{ name: string; xml: string }>
): Promise<ProvisionStep> {
  const created = await createList(webUrl, digest, title, description);
  if (created) {
    await waitForListAvailability(webUrl, title, 16, 1000);
  }
  let fieldMap = await getFieldMap(webUrl, title);
  if (!Object.keys(fieldMap).length) {
    fieldMap = await getFieldMap(webUrl, title);
  }
  const fieldsCreated: string[] = [];
  for (const field of fieldDefinitions) {
    if (fieldMap[field.name]) continue;
    const added = await ensureField(webUrl, digest, title, field.name, field.xml, fieldMap);
    if (added) {
      fieldsCreated.push(field.name);
      fieldMap[field.name] = 'custom';
    }
  }
  return { title, created, fieldsCreated };
}

async function setListAttachmentsEnabled(webUrl: string, digest: string, title: string, enabled: boolean): Promise<void> {
  const response = await apiFetch(webUrl, `${listUrl(webUrl, title)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify({
      EnableAttachments: enabled,
    }),
  });
  if (!response.ok && response.status !== 204) {
    const details = await response.text().catch(() => '');
    throw new Error(`Update list settings failed for ${title} (${response.status})${details ? `: ${details}` : ''}`);
  }
}

async function ensureRuntimeStorageReady(webUrl: string, digest: string, title: string): Promise<void> {
  if (title === LISTS.acumen) {
    if (await listExists(webUrl, LISTS.acumen)) {
      await setListAttachmentsEnabled(webUrl, digest, LISTS.acumen, true);
    }
    return;
  }
  if (title === LISTS.biodata) {
    if (await listExists(webUrl, LISTS.biodata)) {
      await setListAttachmentsEnabled(webUrl, digest, LISTS.biodata, true);
      return;
    }
    return;
  }
}

function companyFields() {
  return [
    { name: 'CompanyKey', xml: fieldXmlText('CompanyKey', 'Company Key', true) },
    { name: 'CompanyName', xml: fieldXmlText('CompanyName', 'Company Name', true) },
    { name: 'CanonicalName', xml: fieldXmlText('CanonicalName', 'Canonical Name', true) },
    { name: 'Description', xml: fieldXmlNote('Description', 'Description', false, false) },
    { name: 'Status', xml: fieldXmlChoice('Status', 'Status', ['Active', 'Inactive', 'Archived'], true) },
    { name: 'ContactCount', xml: fieldXmlText('ContactCount', 'Contact Count', false) },
    { name: 'LatestActivity', xml: fieldXmlDate('LatestActivity', 'Latest Activity', false) },
    { name: 'AcumenSummary', xml: fieldXmlNote('AcumenSummary', 'Acumen Summary', false, false) },
  ];
}

function masterLookupFields(kind: 'Project' | 'Job Title') {
  const label = kind === 'Project' ? 'Project' : 'Job Title';
  return [
    { name: `${label.replace(/\s+/g, '')}Key`, xml: fieldXmlText(`${label.replace(/\s+/g, '')}Key`, `${label} Key`, true) },
    { name: `${label.replace(/\s+/g, '')}Name`, xml: fieldXmlText(`${label.replace(/\s+/g, '')}Name`, `${label} Name`, true) },
    { name: 'Status', xml: fieldXmlChoice('Status', 'Status', ['Active', 'Inactive'], true) },
    { name: 'SortOrder', xml: fieldXmlText('SortOrder', 'Sort Order', false) },
  ];
}

function normalizeSeedKey(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeSeedLabel(value: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function dedupeAlphabetical(values: string[]): string[] {
  const seen = new Map<string, string>();
  values.forEach((value) => {
    const label = normalizeSeedLabel(value);
    const key = normalizeSeedKey(label);
    if (!label || !key) return;
    if (!seen.has(key) || label.localeCompare(seen.get(key) || '', undefined, { sensitivity: 'base' }) < 0) {
      seen.set(key, label);
    }
  });
  return Array.from(seen.values()).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

async function upsertSeedRow(
  webUrl: string,
  digest: string,
  listName: string,
  identityField: string,
  identityValue: string,
  payload: Record<string, any>,
  fieldMap: Record<string, string> = {},
): Promise<'created' | 'updated'> {
  const safeIdentity = normalizeSeedKey(identityValue);
  if (!safeIdentity) return 'updated';

  const existing = await getJson(
    webUrl,
    `${listUrl(webUrl, listName)}/items?$select=Id,Title&$top=5000`
  ).catch(() => null);
  const current = (existing?.value || []).find((item: any) => normalizeSeedKey(item?.Title) === safeIdentity);
  const safePayload: Record<string, any> = {};
  Object.keys(payload).forEach((key) => {
    if (key === 'Title' || fieldMap[key] !== undefined) {
      safePayload[key] = payload[key];
    }
  });

  if (current?.Id) {
    await fetch(`${listUrl(webUrl, listName)}/items(${current.Id})`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'X-RequestDigest': digest,
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE',
      },
      body: JSON.stringify(safePayload),
    });
    return 'updated';
  }

  await ensureListItem(webUrl, digest, listName, safePayload);
  return 'created';
}

function companyAcumenFields() {
  return [
    { name: 'CompanyKey', xml: fieldXmlText('CompanyKey', 'Company Key', true) },
    { name: 'CompanyName', xml: fieldXmlText('CompanyName', 'Company Name', true) },
    { name: 'FileName', xml: fieldXmlText('FileName', 'File Name', true) },
    { name: 'FileUrl', xml: fieldXmlUrl('FileUrl', 'File URL', false) },
    { name: 'Notes', xml: fieldXmlNote('Notes', 'Notes', false, false) },
    { name: 'UploadedBy', xml: fieldXmlText('UploadedBy', 'Uploaded By', false) },
    { name: 'UploadedAt', xml: fieldXmlDate('UploadedAt', 'Uploaded At', false) },
  ];
}

function biodataFields() {
  return [
    { name: 'contact_id', xml: fieldXmlText('contact_id', 'Contact Id', true) },
    { name: 'full_name', xml: fieldXmlText('full_name', 'Full Name', true) },
    { name: 'preferred_name', xml: fieldXmlText('preferred_name', 'Preferred Name') },
    { name: 'current_company', xml: fieldXmlText('current_company', 'Current Company') },
    { name: 'job_title', xml: fieldXmlText('job_title', 'Job Title') },
    { name: 'salutation', xml: fieldXmlChoice('salutation', 'Salutation', ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Engr', 'Barrister', 'Hon', 'Chief', 'Alhaji', 'Alhaja']) },
    { name: 'gender', xml: fieldXmlChoice('gender', 'Gender', ['Male', 'Female', 'Prefer not to say']) },
    { name: 'date_of_birth', xml: fieldXmlDate('date_of_birth', 'Date of Birth') },
    { name: 'profile_photo_url', xml: fieldXmlUrl('profile_photo_url', 'Profile Photo URL') },
    { name: 'record_status', xml: fieldXmlChoice('record_status', 'Record Status', ['Active', 'Inactive', 'Archived'], true) },
    { name: 'record_owner', xml: fieldXmlUser('record_owner', 'Record Owner', true) },
    { name: 'nationality', xml: fieldXmlText('nationality', 'Nationality') },
    { name: 'birth_country', xml: fieldXmlText('birth_country', 'Birth Country') },
    { name: 'birth_state', xml: fieldXmlText('birth_state', 'Birth State') },
    { name: 'hometown', xml: fieldXmlText('hometown', 'Hometown') },
    { name: 'ethnicity', xml: fieldXmlText('ethnicity', 'Ethnicity') },
    { name: 'religion', xml: fieldXmlChoice('religion', 'Religion', ['Christianity', 'Islam', 'Traditional', 'Other', 'Prefer not to say']) },
    { name: 'languages_spoken', xml: fieldXmlNote('languages_spoken', 'Languages Spoken') },
    { name: 'education', xml: fieldXmlNote('education', 'Education') },
    { name: 'certifications', xml: fieldXmlNote('certifications', 'Certifications') },
    { name: 'work_history', xml: fieldXmlNote('work_history', 'Work History') },
    { name: 'board_positions', xml: fieldXmlNote('board_positions', 'Board Positions') },
    { name: 'preferred_channels', xml: fieldXmlNote('preferred_channels', 'Preferred Channels') },
    { name: 'preferred_contact_time', xml: fieldXmlChoice('preferred_contact_time', 'Preferred Contact Time', ['Morning', 'Midday', 'Afternoon', 'Evening', 'Flexible']) },
    { name: 'preferred_meeting_format', xml: fieldXmlChoice('preferred_meeting_format', 'Preferred Meeting Format', ['In-Person', 'Video', 'Phone', 'Flexible']) },
    { name: 'communication_formality', xml: fieldXmlChoice('communication_formality', 'Communication Formality', ['Formal', 'Semi-Formal', 'Casual']) },
    { name: 'gatekeeper_name', xml: fieldXmlText('gatekeeper_name', 'Gatekeeper Name') },
    { name: 'gatekeeper_phone', xml: fieldXmlText('gatekeeper_phone', 'Gatekeeper Phone') },
    { name: 'comms_notes', xml: fieldXmlNote('comms_notes', 'Comms Notes') },
    { name: 'personal_interests', xml: fieldXmlNote('personal_interests', 'Personal Interests') },
    { name: 'motivators', xml: fieldXmlNote('motivators', 'Motivators') },
    { name: 'decision_making_style', xml: fieldXmlChoice('decision_making_style', 'Decision Making Style', ['Consultative', 'Autonomous', 'Consensus', 'Data-first']) },
    { name: 'referral_source', xml: fieldXmlText('referral_source', 'Referral Source') },
    { name: 'known_associates', xml: fieldXmlNote('known_associates', 'Known Associates') },
    { name: 'sensitivity_flags', xml: fieldXmlNote('sensitivity_flags', 'Sensitivity Flags') },
    { name: 'account_notes', xml: fieldXmlNote('account_notes', 'Account Notes') },
    { name: 'consent_email', xml: fieldXmlBoolean('consent_email', 'Consent Email', true) },
    { name: 'consent_sms', xml: fieldXmlBoolean('consent_sms', 'Consent SMS', true) },
    { name: 'consent_date', xml: fieldXmlDate('consent_date', 'Consent Date') },
    { name: 'data_source', xml: fieldXmlText('data_source', 'Data Source') },
    { name: 'created_date', xml: fieldXmlDate('created_date', 'Created Date', true) },
    { name: 'last_modified_date', xml: fieldXmlDate('last_modified_date', 'Last Modified Date', true) },
    { name: 'deletion_requested', xml: fieldXmlBoolean('deletion_requested', 'Deletion Requested', true) },
  ];
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

function accessRequestFields() {
  return [
    { name: 'ClientID', xml: fieldXmlText('ClientID', 'Client ID', true) },
    { name: 'ClientName', xml: fieldXmlText('ClientName', 'Client Name', true) },
    { name: 'CompanyName', xml: fieldXmlText('CompanyName', 'Company Name', false) },
    { name: 'RequesterKey', xml: fieldXmlText('RequesterKey', 'Requester Key', true) },
    { name: 'RequesterName', xml: fieldXmlText('RequesterName', 'Requester Name', true) },
    { name: 'RequesterEmail', xml: fieldXmlText('RequesterEmail', 'Requester Email', false) },
    { name: 'OwnerKey', xml: fieldXmlText('OwnerKey', 'Owner Key', false) },
    { name: 'OwnerName', xml: fieldXmlText('OwnerName', 'Owner Name', false) },
    { name: 'Status', xml: fieldXmlChoice('Status', 'Status', ['Pending', 'Approved', 'Declined', 'Expired'], true) },
    { name: 'Reason', xml: fieldXmlNote('Reason', 'Reason', false, false) },
    { name: 'RequestedAt', xml: fieldXmlDate('RequestedAt', 'Requested At', true) },
    { name: 'RespondedAt', xml: fieldXmlDate('RespondedAt', 'Responded At', false) },
    { name: 'ExpiresAt', xml: fieldXmlDate('ExpiresAt', 'Expires At', false) },
    { name: 'ResponseBy', xml: fieldXmlText('ResponseBy', 'Response By', false) },
  ];
}

function kairosClientManagementFields() {
  return [
    { name: 'NeedsOpportunity', xml: fieldXmlNote('NeedsOpportunity', 'Needs & Opportunity', false, false) },
  ];
}

async function ensureAttachmentEnabledList(webUrl: string, digest: string, title: string, description: string, fields: Array<{ name: string; xml: string }>): Promise<ProvisionStep> {
  const step = await ensureListWithFields(webUrl, digest, title, description, fields);
  await setListAttachmentsEnabled(webUrl, digest, title, true);
  return step;
}

export const GEMS_LISTS = {
  compliance: 'GEMS_Compliance',
  actions: 'GEMS_Actions',
  auditLog: 'GEMS_AuditLog',
  interactions: 'GEMS_Interactions',
};

function gemsComplianceFields() {
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

function gemsActionFields() {
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

function gemsAuditLogFields() {
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

function gemsInteractionFields() {
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

export async function provisionGemsLists(context: WebPartContext): Promise<ProvisionStep[]> {
  const webUrl = resolveKriDataSiteUrl(context);
  const digest = await getRequestDigest(webUrl);
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

  steps.push(await ensure(GEMS_LISTS.interactions, 'GEMS interaction intelligence, category scoring, and meeting notes.', gemsInteractionFields()));
  steps.push(await ensure(GEMS_LISTS.compliance, 'GEMS compliance records — permits, licences, obligations, and regulatory filings with expiry tracking.', gemsComplianceFields()));
  steps.push(await ensure(GEMS_LISTS.actions, 'GEMS action items and follow-up tasks linked to stakeholders, agencies, interactions, and compliance records.', gemsActionFields()));
  steps.push(await ensure(GEMS_LISTS.auditLog, 'GEMS universal audit trail — tracks all create, update, delete, view, and export events across GEMS entities.', gemsAuditLogFields()));

  // Verify every list actually exists in SharePoint — report failures clearly
  for (const step of steps) {
    const verified = await verifyListExists(webUrl, step.title);
    if (!verified) {
      console.warn(`[provisionGemsLists] Verification FAILED for "${step.title}" — the list was not found after provisioning`);
      step.created = false;
    }
  }

  return steps;
}


const DOC_LIBRARY = 'KRI_AcumenFiles';

/** Ensure the KRI_AcumenFiles document library exists (BaseTemplate 101). */
async function ensureDocumentLibrary(webUrl: string, digest: string): Promise<void> {
  if (await listExists(webUrl, DOC_LIBRARY)) return;
  const resp = await fetch(`${webUrl}/_api/web/lists`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
      'odata-version': '',
    },
    body: JSON.stringify({ Title: DOC_LIBRARY, BaseTemplate: 101, Description: 'Company acumen documents' }),
  });
  if (!resp.ok && resp.status !== 409) throw new Error(`Create doc library failed (${resp.status})`);
  await waitForListAvailability(webUrl, DOC_LIBRARY);
}

/** Upload a file to the KRI_AcumenFiles document library under a company subfolder. Returns the absolute file URL. */
async function uploadToDocLib(webUrl: string, digest: string, folderKey: string, file: File): Promise<string> {
  const sitePath = new URL(webUrl).pathname.replace(/\/$/, '');
  const safeFolderKey = folderKey.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const folderSrvRel = `${sitePath}/${DOC_LIBRARY}/${safeFolderKey}`;

  // Sanitise filename: replace spaces with dashes to avoid encoding headaches
  const safeFileName = file.name.replace(/\s+/g, '-');

  // Ensure folder (ignore errors — folder may already exist)
  await fetch(`${webUrl}/_api/web/folders`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
      'odata-version': '',
    },
    body: JSON.stringify({ ServerRelativeUrl: folderSrvRel }),
  }).catch(() => null);

  const bytes = await file.arrayBuffer();
  // SP REST: server-relative URL inside quotes must NOT be URI-encoded
  const uploadResp = await fetch(
    `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${folderSrvRel}')/Files/add(url='${safeFileName}',overwrite=true)`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json;odata=nometadata',
        'X-RequestDigest': digest,
        'Content-Type': 'application/octet-stream',
        'odata-version': '',
      },
      body: bytes,
    }
  );
  if (!uploadResp.ok) throw new Error(`Doc library upload failed (${uploadResp.status})`);
  const uploadJson = await uploadResp.json().catch(() => null);
  const serverRelativeUrl = String(uploadJson?.ServerRelativeUrl || `${folderSrvRel}/${safeFileName}`);
  const origin = new URL(webUrl).origin;
  return `${origin}${serverRelativeUrl}`;
}
function buildLookupSeedPayload(displayName: string, keyField: string, sortOrder: number): Record<string, any> {
  const normalized = normalizeSeedLabel(displayName);
  return {
    Title: normalized,
    [keyField]: normalizeSeedKey(normalized),
    [keyField.replace(/Key$/, 'Name')]: normalized,
    Status: 'Active',
    SortOrder: String(sortOrder).padStart(4, '0'),
  };
}

export async function seedLookupListsFromCurrentRegistry(context: WebPartContext): Promise<SeedStep[]> {
  const webUrl = resolveKriDataSiteUrl(context);
  const digest = await getRequestDigest(webUrl);
  const clients = await getClients(context).catch(() => [] as IClient[]);
  const companyFieldMap = await getFieldMap(webUrl, LISTS.companies);
  const projectFieldMap = await getFieldMap(webUrl, LISTS.projects);
  const jobTitleFieldMap = await getFieldMap(webUrl, LISTS.jobTitles);

  const companies = dedupeAlphabetical(clients.map((client) => client.CompanyName));
  const projects = dedupeAlphabetical(clients.map((client) => client.ProjectName));
  const jobTitles = dedupeAlphabetical(clients.map((client) => client.JobTitle));

  const steps: SeedStep[] = [];

  let companyCreated = 0;
  let companyUpdated = 0;
  for (let index = 0; index < companies.length; index += 1) {
    const name = companies[index];
    const result = await upsertSeedRow(webUrl, digest, LISTS.companies, 'CompanyKey', name, {
      Title: name,
      CompanyKey: normalizeSeedKey(name),
      CompanyName: name,
      CanonicalName: name,
      Status: 'Active',
      SortOrder: String(index + 1).padStart(4, '0'),
      ContactCount: String(clients.filter((client) => normalizeSeedKey(client.CompanyName) === normalizeSeedKey(name)).length),
    }, companyFieldMap);
    if (result === 'created') companyCreated += 1;
    else companyUpdated += 1;
  }
  steps.push({ title: LISTS.companies, created: companyCreated, updated: companyUpdated });

  let projectCreated = 0;
  let projectUpdated = 0;
  for (let index = 0; index < projects.length; index += 1) {
    const name = projects[index];
    const result = await upsertSeedRow(webUrl, digest, LISTS.projects, 'ProjectKey', name, buildLookupSeedPayload(name, 'ProjectKey', index + 1), projectFieldMap);
    if (result === 'created') projectCreated += 1;
    else projectUpdated += 1;
  }
  steps.push({ title: LISTS.projects, created: projectCreated, updated: projectUpdated });

  let titleCreated = 0;
  let titleUpdated = 0;
  for (let index = 0; index < jobTitles.length; index += 1) {
    const name = jobTitles[index];
    const result = await upsertSeedRow(webUrl, digest, LISTS.jobTitles, 'JobTitleKey', name, buildLookupSeedPayload(name, 'JobTitleKey', index + 1), jobTitleFieldMap);
    if (result === 'created') titleCreated += 1;
    else titleUpdated += 1;
  }
  steps.push({ title: LISTS.jobTitles, created: titleCreated, updated: titleUpdated });

  return steps;
}

function cleanItemPayload(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  const ignored = new Set(['id', 'ID', 'author', 'Author', 'editor', 'Editor', 'created', 'Created', 'modified', 'Modified', 'attachments', 'AttachmentFiles', '__metadata']);
  Object.keys(fields).forEach((key) => {
    if (ignored.has(key)) return;
    const val = fields[key];
    if (val === undefined || val === null || val === '') return;
    if (typeof val === 'object' && !Array.isArray(val) && (val?.Id || val?.ID || val?.LookupId)) {
      const id = Number(val.Id || val.ID || val.LookupId);
      if (!Number.isNaN(id) && id > 0) {
        result[`${key}Id`] = id;
      }
      return;
    }
    result[key] = val;
  });
  return result;
}

function buildFormValuesForValidateUpdate(fields: Record<string, any>): Array<{ FieldName: string; FieldValue: string }> {
  const ignored = new Set([
    'id', 'ID', 'author', 'Author', 'editor', 'Editor',
    'created', 'Created', 'modified', 'Modified',
    'attachments', 'Attachments', 'attachmentfiles', 'AttachmentFiles',
    'odata.type', 'odata.id', 'odata.editLink', 'odata.etag', 'odata.metadata', '__metadata'
  ]);
  const formValues: Array<{ FieldName: string; FieldValue: string }> = [];

  Object.keys(fields).forEach((key) => {
    if (ignored.has(key)) return;
    const val = fields[key];
    if (val === undefined || val === null || val === '') return;

    let fieldName = key;
    let strValue = '';

    if (Array.isArray(val)) {
      strValue = val
        .map((v) => (typeof v === 'object' ? v?.Title || v?.Value || String(v) : String(v)))
        .filter(Boolean)
        .join(';#');
    } else if (typeof val === 'object') {
      if (val?.Email || val?.LoginName || val?.UserPrincipalName) {
        const emailOrLogin = val.Email || val.LoginName || val.UserPrincipalName;
        strValue = `[{'Key':'${emailOrLogin}'}]`;
      } else if (val?.Id || val?.ID || val?.LookupId) {
        strValue = String(val.Id || val.ID || val.LookupId);
      } else {
        strValue = val?.Title || val?.Value || val?.Name || '';
      }
    } else if (typeof val === 'boolean') {
      strValue = val ? '1' : '0';
    } else {
      strValue = String(val);
    }

    if (strValue) {
      formValues.push({ FieldName: fieldName, FieldValue: strValue });
    }
  });

  return formValues;
}

function extractItemIdFromValidateResult(data: any): number | null {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.value)
      ? data.value
      : Array.isArray(data?.d?.AddValidateUpdateItemUsingPath?.results)
        ? data.d.AddValidateUpdateItemUsingPath.results
        : Array.isArray(data?.d?.results)
          ? data.d.results
          : Array.isArray(data?.d)
            ? data.d
            : [];
  for (const entry of list) {
    const id = Number(entry?.ItemId || entry?.Id || entry?.ID);
    if (Number.isFinite(id) && id > 0) {
      return id;
    }
  }
  return null;
}

async function ensureListItem(webUrl: string, digest: string, listName: string, fields: Record<string, any>): Promise<any> {
  // Strategy 1: AddValidateUpdateItemUsingPath
  try {
    const formValues = buildFormValuesForValidateUpdate(fields);
    if (formValues.length > 0) {
      const validatePayload = JSON.stringify({
        listItemCreateInfo: {
          FolderPath: { DecodedUrl: '' },
          UnderlyingObjectType: 0,
        },
        formValues,
        bNewDocumentUpdate: false,
      });
      const validateUrl = `${listUrl(webUrl, listName)}/AddValidateUpdateItemUsingPath`;

      for (const attempt of requestAttempts(webUrl, validateUrl)) {
        try {
          const response = await fetch(attempt, {
            method: 'POST',
            credentials: 'include',
            headers: {
              Accept: 'application/json;odata=nometadata',
              'Content-Type': 'application/json;odata=nometadata',
              'X-RequestDigest': digest,
            },
            body: validatePayload,
          });
          if (response.ok) {
            const resJson = await response.json();
            const newItemId = extractItemIdFromValidateResult(resJson);
            if (newItemId) {
              return { Id: newItemId, ID: String(newItemId), ...fields };
            }
          }
        } catch { /* continue */ }
      }
    }
  } catch { /* continue */ }

  // Strategy 2: Direct REST /items
  const body = JSON.stringify(cleanItemPayload(fields));
  let lastError: unknown = null;
  for (const attempt of requestAttempts(webUrl, `${listUrl(webUrl, listName)}/items`)) {
    try {
      const response = await fetch(attempt, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'X-RequestDigest': digest,
        },
        body,
      });
      if (!response.ok) {
        let detail = '';
        try { detail = await response.text(); } catch { /* ignore */ }
        throw new Error(`Create item failed for ${listName} (${response.status}): ${detail}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Create item failed for ${listName}`);
}

async function updateListItem(webUrl: string, digest: string, listName: string, itemId: string | number, fields: Record<string, any>): Promise<void> {
  const safeId = String(itemId || '').trim();
  if (!safeId) return;

  // Strategy 1: validateUpdateListItem
  try {
    const formValues = buildFormValuesForValidateUpdate(fields);
    if (formValues.length > 0) {
      const validatePayload = JSON.stringify({
        formValues,
        bNewDocumentUpdate: false,
      });
      const validateUrl = `${listUrl(webUrl, listName)}/items(${safeId})/validateUpdateListItem`;

      for (const attempt of requestAttempts(webUrl, validateUrl)) {
        try {
          const response = await fetch(attempt, {
            method: 'POST',
            credentials: 'include',
            headers: {
              Accept: 'application/json;odata=nometadata',
              'Content-Type': 'application/json;odata=nometadata',
              'X-RequestDigest': digest,
            },
            body: validatePayload,
          });
          if (response.ok) return;
        } catch { /* continue */ }
      }
    }
  } catch { /* continue */ }

  // Strategy 2: Direct MERGE
  const body = JSON.stringify(cleanItemPayload(fields));
  let lastError: unknown = null;
  for (const attempt of requestAttempts(webUrl, `${listUrl(webUrl, listName)}/items(${safeId})`)) {
    try {
      const response = await fetch(attempt, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'X-RequestDigest': digest,
          'IF-MATCH': '*',
          'X-HTTP-Method': 'MERGE',
        },
        body,
      });
      if (!response.ok && response.status !== 204) {
        let detail = '';
        try { detail = await response.text(); } catch { /* ignore */ }
        throw new Error(`Update item failed for ${listName}/${safeId} (${response.status}): ${detail}`);
      }
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Update item failed for ${listName}/${safeId}`);
}

async function deleteListItem(webUrl: string, digest: string, listName: string, itemId: string | number): Promise<void> {
  const safeId = String(itemId || '').trim();
  if (!safeId) return;
  let lastError: unknown = null;
  for (const attempt of requestAttempts(webUrl, `${listUrl(webUrl, listName)}/items(${safeId})`)) {
    try {
      const response = await fetch(attempt, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'X-RequestDigest': digest,
          'IF-MATCH': '*',
          'X-HTTP-Method': 'DELETE',
        },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Delete item failed for ${listName} (${response.status})`);
      }
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Delete item failed for ${listName} (${safeId})`);
}

export async function upsertCompanyRegistryRecord(
  context: WebPartContext,
  companyKey: string,
  companyName: string,
  contactCount = 0,
  summary = ''
): Promise<void> {
  const webUrl = resolveKriDataSiteUrl(context);
  const digest = await getRequestDigest(webUrl);
  const normalizedKey = String(companyKey || '').trim().toLowerCase();
  const normalizedName = String(companyName || '').trim();
  if (!normalizedName) return;
  const existing = await getJson(webUrl, `${listUrl(webUrl, LISTS.companies)}/items?$select=Id,CompanyKey,CompanyName&$filter=CompanyKey eq '${normalizedKey.replace(/'/g, "''")}'&$top=5`).catch(() => null);
  const payload = {
    CompanyKey: normalizedKey || normalizedName.toLowerCase(),
    CompanyName: normalizedName,
    CanonicalName: normalizedName,
    ContactCount: String(contactCount),
    AcumenSummary: summary,
    Status: 'Active',
  };
  const current = existing?.value?.[0];
  if (current?.Id) {
    await updateListItem(webUrl, digest, LISTS.companies, current.Id, payload);
    return;
  }
  await ensureListItem(webUrl, digest, LISTS.companies, payload);
}

export async function saveCompanyAcumenFile(
  context: WebPartContext,
  companyKey: string,
  companyName: string,
  file: File
): Promise<void> {
  const webUrl = resolveKriDataSiteUrl(context);
  const digest = await getRequestDigest(webUrl);

  // 1. Ensure metadata list exists
  await ensureRuntimeStorageReady(webUrl, digest, LISTS.acumen);

  // 2. Upload file to the KRI_AcumenFiles document library
  await ensureDocumentLibrary(webUrl, digest);
  const normalizedKey = String(companyKey || companyName || '').trim().toLowerCase() || 'general';
  await uploadToDocLib(webUrl, digest, normalizedKey, file);

  // 3. Delete ALL existing metadata rows for this company (avoids MERGE 400 on corrupted items)
  const existing = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.acumen)}/items?$select=Id&$filter=CompanyKey eq '${normalizedKey.replace(/'/g, "''")}'&$top=50`
  ).catch(() => null);
  for (const item of (existing?.value || [])) {
    await deleteListItem(webUrl, digest, LISTS.acumen, item?.Id || item?.ID).catch(() => undefined);
  }

  // 4. Create a fresh metadata row
  const title = String(companyName || companyKey || file.name || 'Company Acumen').trim();
  const payload: Record<string, string> = {
    Title: title,
    CompanyKey: normalizedKey,
    CompanyName: title,
    FileName: file.name.replace(/\s+/g, '-'),
    Notes: `Uploaded ${new Date().toISOString()}`,
    UploadedBy: context.pageContext.user.displayName,
    UploadedAt: new Date().toISOString().split('T')[0],
  };
  await ensureListItem(webUrl, digest, LISTS.acumen, payload);
}

export async function getCompanyAcumenRecords(
  context: WebPartContext,
  companyKey: string
): Promise<CompanyAcumenRecord[]> {
  const webUrl = resolveKriDataSiteUrl(context);
  const normalizedKey = String(companyKey || '').trim().toLowerCase();
  if (!normalizedKey) return [];
  const data = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.acumen)}/items?$select=Id,Title,CompanyKey,CompanyName,FileName,Notes,UploadedBy,UploadedAt&$filter=CompanyKey eq '${normalizedKey.replace(/'/g, "''")}'&$orderby=UploadedAt desc&$top=20`
  ).catch(() => ({ value: [] }));
  return (data.value || []).map((item: any) => {
    const compKey = String(item.CompanyKey || '').trim().toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
    const fileName = String(item.FileName || item.Title || '');
    // Derive the doc library URL from the convention: {webUrl}/KRI_AcumenFiles/{companyKey}/{fileName}
    const docLibUrl = compKey && fileName
      ? `${webUrl}/${DOC_LIBRARY}/${compKey}/${fileName}`
      : '';
    return {
      ID: String(item.Id || item.ID || ''),
      Title: String(item.Title || item.CompanyName || fileName || ''),
      CompanyKey: compKey,
      CompanyName: String(item.CompanyName || ''),
      FileName: fileName,
      FileUrl: docLibUrl,
      Notes: String(item.Notes || ''),
      UploadedBy: String(item.UploadedBy || ''),
      UploadedAt: String(item.UploadedAt || ''),
      AttachmentFiles: item.AttachmentFiles,
    };
  }) as CompanyAcumenRecord[];
}

export async function ensureKairosClientManagementFields(context: WebPartContext): Promise<void> {
  const webUrl = resolveKriDataSiteUrl(context);
  const digest = await getRequestDigest(webUrl);
  await ensureListWithFields(
    webUrl,
    digest,
    'KRI_Clients',
    'KAIROS contact registry with management-only opportunity intelligence.',
    kairosClientManagementFields()
  );
}

function requesterKeyFromContext(context: WebPartContext): string {
  return String(context.pageContext.user.email || context.pageContext.user.loginName || context.pageContext.user.displayName || '')
    .trim()
    .toLowerCase();
}

function clientDisplayName(client: Partial<IClient>): string {
  return `${client.FirstName || ''} ${client.LastName || ''}`.trim() || client.Title || client.CompanyName || `Contact ${client.ID || ''}`.trim();
}

function clientOwnerName(client: Partial<IClient>): string {
  const owner = client.KCCContactPerson as any;
  if (!owner) return '';
  return String(owner.Title || owner.LookupValue || owner.DisplayName || owner.Name || owner.Email || owner.LoginName || '').trim();
}

function clientOwnerKey(client: Partial<IClient>): string {
  const owner = client.KCCContactPerson as any;
  const candidates = [
    client.KCCContactPersonId,
    owner?.Email,
    owner?.EMail,
    owner?.LoginName,
    owner?.Name,
    owner?.Title,
    owner?.LookupValue,
  ];
  const found = candidates.find((entry) => entry !== undefined && entry !== null && String(entry).trim());
  return found ? String(found).trim().toLowerCase() : '';
}

const accessRequestsAvailabilityCache: Record<string, Promise<boolean>> = {};

async function hasAccessRequestsList(webUrl: string): Promise<boolean> {
  if (!accessRequestsAvailabilityCache[webUrl]) {
    accessRequestsAvailabilityCache[webUrl] = (async () => {
      try {
        await getJson(webUrl, `${listUrl(webUrl, LISTS.accessRequests)}?$select=Id,Title`);
        return true;
      } catch {
        return false;
      }
    })();
  }
  return accessRequestsAvailabilityCache[webUrl];
}

async function ensureAccessRequestsReady(webUrl: string, digest: string): Promise<boolean> {
  if (await hasAccessRequestsList(webUrl)) return true;
  if (!digest) return false;
  try {
    await ensureListWithFields(
      webUrl,
      digest,
      LISTS.accessRequests,
      'Contact access requests between KAIROS users and contact owners.',
      accessRequestFields()
    );
    accessRequestsAvailabilityCache[webUrl] = Promise.resolve(true);
    return true;
  } catch (error) {
    console.warn('[sharepointProvisioning] Contact access requests list unavailable:', error);
    accessRequestsAvailabilityCache[webUrl] = Promise.resolve(false);
    return false;
  }
}

function normalizeAccessRequest(item: any): KairosContactAccessRequest {
  const expiresAt = String(item.ExpiresAt || '');
  const pendingExpired = String(item.Status || 'Pending') === 'Pending'
    && expiresAt
    && new Date(expiresAt).getTime() < Date.now();
  return {
    ID: String(item.Id || item.ID || ''),
    Title: String(item.Title || ''),
    ClientID: String(item.ClientID || ''),
    ClientName: String(item.ClientName || ''),
    CompanyName: String(item.CompanyName || ''),
    RequesterKey: String(item.RequesterKey || '').toLowerCase(),
    RequesterName: String(item.RequesterName || ''),
    RequesterEmail: String(item.RequesterEmail || ''),
    OwnerKey: String(item.OwnerKey || '').toLowerCase(),
    OwnerName: String(item.OwnerName || ''),
    Status: (pendingExpired ? 'Expired' : String(item.Status || 'Pending')) as KairosAccessRequestStatus,
    Reason: String(item.Reason || ''),
    RequestedAt: String(item.RequestedAt || ''),
    RespondedAt: String(item.RespondedAt || ''),
    ExpiresAt: expiresAt,
    ResponseBy: String(item.ResponseBy || ''),
  };
}

async function getAllContactAccessRequests(context: WebPartContext): Promise<KairosContactAccessRequest[]> {
  const webUrl = resolveKriDataSiteUrl(context);
  if (!(await hasAccessRequestsList(webUrl))) return [];
  const url = `${listUrl(webUrl, LISTS.accessRequests)}/items?$select=*&$top=1000`;
  const data = await getJson(webUrl, url).catch((error) => {
    console.warn('[sharepointProvisioning] Access requests query failed:', error);
    return { value: [] };
  });
  return (data.value || [])
    .map(normalizeAccessRequest)
    .sort((left, right) => {
      const leftDate = new Date(left.RequestedAt || left.ID || 0).getTime();
      const rightDate = new Date(right.RequestedAt || right.ID || 0).getTime();
      return rightDate - leftDate;
    });
}

export async function getContactAccessRequestsForUser(context: WebPartContext): Promise<KairosContactAccessRequest[]> {
  const requesterKey = requesterKeyFromContext(context);
  if (!requesterKey) return [];
  const requests = await getAllContactAccessRequests(context);
  return requests.filter((request) => (
    request.RequesterKey === requesterKey
    || request.RequesterEmail.toLowerCase() === requesterKey
  ));
}

export async function getContactAccessRequestsForClient(context: WebPartContext, clientId: string): Promise<KairosContactAccessRequest[]> {
  const safeId = String(clientId || '').trim();
  if (!safeId) return [];
  const requests = await getAllContactAccessRequests(context);
  return requests.filter((request) => String(request.ClientID) === safeId);
}

export async function getContactAccessRequestsForOwner(context: WebPartContext): Promise<KairosContactAccessRequest[]> {
  const siteUser = await getCurrentSiteUser(context).catch(() => null);
  const ownerKeys = [
    siteUser?.Id,
    siteUser?.Email,
    siteUser?.LoginName,
    siteUser?.Title,
    context.pageContext.user.email,
    context.pageContext.user.loginName,
    context.pageContext.user.displayName,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  if (!ownerKeys.length) return [];
  const allowed = new Set(ownerKeys);
  const requests = await getAllContactAccessRequests(context);
  return requests.filter((request) => allowed.has(String(request.OwnerKey || '').toLowerCase()));
}

export async function requestContactAccess(
  context: WebPartContext,
  client: Partial<IClient>,
  reason = ''
): Promise<KairosContactAccessRequest> {
  const webUrl = resolveKriDataSiteUrl(context);
  const digest = await getRequestDigest(webUrl);
  if (!(await ensureAccessRequestsReady(webUrl, digest))) {
    throw new Error('Contact access requests are not available in this site.');
  }

  const requesterKey = requesterKeyFromContext(context);
  const clientId = String(client.ID || '').trim();
  if (!requesterKey || !clientId) {
    throw new Error('A valid requester and contact are required before access can be requested.');
  }

  const existing = (await getContactAccessRequestsForClient(context, clientId)).find((request) => (
    request.RequesterKey === requesterKey
    && (request.Status === 'Pending' || request.Status === 'Approved')
  ));
  if (existing) return existing;

  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const payload: Record<string, any> = {
    Title: `Access request: ${clientDisplayName(client)}`,
    ClientID: clientId,
    ClientName: clientDisplayName(client),
    CompanyName: String(client.CompanyName || ''),
    RequesterKey: requesterKey,
    RequesterName: context.pageContext.user.displayName || context.pageContext.user.email || context.pageContext.user.loginName || '',
    RequesterEmail: context.pageContext.user.email || '',
    OwnerKey: clientOwnerKey(client),
    OwnerName: clientOwnerName(client),
    Status: 'Pending',
    Reason: String(reason || ''),
    RequestedAt: now.toISOString(),
    ExpiresAt: expires.toISOString(),
  };

  const created = await ensureListItem(webUrl, digest, LISTS.accessRequests, payload);
  return normalizeAccessRequest({ ...payload, Id: created?.Id || created?.ID });
}

export async function respondToContactAccessRequest(
  context: WebPartContext,
  requestId: string,
  status: Extract<KairosAccessRequestStatus, 'Approved' | 'Declined'>
): Promise<void> {
  const webUrl = resolveKriDataSiteUrl(context);
  const digest = await getRequestDigest(webUrl);
  if (!(await ensureAccessRequestsReady(webUrl, digest))) {
    throw new Error('Contact access requests are not available in this site.');
  }
  await updateListItem(webUrl, digest, LISTS.accessRequests, requestId, {
    Status: status,
    RespondedAt: new Date().toISOString(),
    ResponseBy: context.pageContext.user.displayName || context.pageContext.user.email || context.pageContext.user.loginName || '',
  });
}

function normalizeJsonText(value: any): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeDateOnlyText(value: any): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function coerceBoolean(value: any): boolean {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function normalizeLookupText(value: any): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function pickLookupText(item: any, candidates: string[]): string {
  for (const candidate of candidates) {
    const value = normalizeLookupText(item?.[candidate]);
    if (value) return value;
  }
  return '';
}

async function getLookupOptions(
  context: WebPartContext,
  listName: string,
  candidates: string[],
): Promise<string[]> {
  const webUrl = resolveKriDataSiteUrl(context);
  const select = Array.from(new Set(['Id', ...candidates])).join(',');
  const data = await getJson(
    webUrl,
    `${listUrl(webUrl, listName)}/items?$select=${select}&$top=5000`
  ).catch(() => ({ value: [] }));
  return dedupeAlphabetical((data.value || []).map((item: any) => pickLookupText(item, candidates)));
}

export async function getCompanyLookupOptions(context: WebPartContext): Promise<string[]> {
  return getLookupOptions(context, LISTS.companies, ['CompanyName', 'CanonicalName', 'Title']);
}

export async function getJobTitleLookupOptions(context: WebPartContext): Promise<string[]> {
  return getLookupOptions(context, LISTS.jobTitles, ['JobTitleName', 'Title']);
}

type BiodataLogicalKey = keyof Omit<BiodataRecord, 'ID'>;

type BiodataFieldBinding = {
  internalName: string;
  title: string;
  type: string;
};

type BiodataSchema = Partial<Record<BiodataLogicalKey, BiodataFieldBinding>>;

const BIODATA_FIELD_CANDIDATES: Partial<Record<BiodataLogicalKey, string[]>> = {
  Title: ['Title', 'Biodata Title'],
  contact_id: ['contact_id', 'Contact_x0020_Id', 'Contact Id', 'Contact ID', 'ContactID', 'Client ID', 'ClientID'],
  full_name: ['full_name', 'Full Name', 'FullName', 'Name', 'Title'],
  preferred_name: ['preferred_name', 'Preferred Name', 'PreferredName'],
  current_company: ['current_company', 'Current Company', 'CurrentCompany', 'Company', 'Company Name', 'CompanyName'],
  job_title: ['job_title', 'Job Title', 'JobTitle', 'Position', 'Designation'],
  salutation: ['salutation', 'Salutation'],
  gender: ['gender', 'Gender', 'Sex'],
  date_of_birth: ['date_of_birth', 'Date of Birth', 'DateOfBirth', 'DOB', 'Birthday', 'BirthdayDate'],
  profile_photo_url: ['profile_photo_url', 'Profile Photo URL', 'Profile Photo', 'ProfilePhotoUrl', 'ProfilePhoto', 'PhotoUrl', 'Photo URL'],
  record_status: ['record_status', 'Record Status', 'RecordStatus', 'Status'],
  record_owner: ['record_owner', 'Record Owner', 'RecordOwner', 'Owner'],
  nationality: ['nationality', 'Nationality'],
  birth_country: ['birth_country', 'Birth Country', 'BirthCountry', 'Country of Birth'],
  birth_state: ['birth_state', 'Birth State', 'BirthState', 'State of Birth'],
  hometown: ['hometown', 'Hometown', 'Home Town'],
  ethnicity: ['ethnicity', 'Ethnicity', 'Tribe'],
  religion: ['religion', 'Religion'],
  languages_spoken: ['languages_spoken', 'Languages Spoken', 'LanguagesSpoken', 'Languages'],
  education: ['education', 'Education', 'Educational Background', 'Education Background'],
  certifications: ['certifications', 'Certifications', 'Certificates'],
  work_history: ['work_history', 'Work History', 'WorkHistory', 'Career History'],
  board_positions: ['board_positions', 'Board Positions', 'BoardPositions'],
  preferred_channels: ['preferred_channels', 'Preferred Channels', 'PreferredChannels'],
  preferred_contact_time: ['preferred_contact_time', 'Preferred Contact Time', 'PreferredContactTime'],
  preferred_meeting_format: ['preferred_meeting_format', 'Preferred Meeting Format', 'PreferredMeetingFormat'],
  communication_formality: ['communication_formality', 'Communication Formality', 'CommunicationFormality'],
  gatekeeper_name: ['gatekeeper_name', 'Gatekeeper Name', 'GatekeeperName'],
  gatekeeper_phone: ['gatekeeper_phone', 'Gatekeeper Phone', 'GatekeeperPhone'],
  comms_notes: ['comms_notes', 'Comms Notes', 'Communication Notes', 'CommsNotes'],
  personal_interests: ['personal_interests', 'Personal Interests', 'PersonalInterests', 'Interests'],
  motivators: ['motivators', 'Motivators'],
  decision_making_style: ['decision_making_style', 'Decision Making Style', 'DecisionMakingStyle'],
  referral_source: ['referral_source', 'Referral Source', 'ReferralSource'],
  known_associates: ['known_associates', 'Known Associates', 'KnownAssociates'],
  sensitivity_flags: ['sensitivity_flags', 'Sensitivity Flags', 'SensitivityFlags'],
  account_notes: ['account_notes', 'Account Notes', 'AccountNotes', 'Notes'],
  consent_email: ['consent_email', 'Consent Email', 'ConsentEmail'],
  consent_sms: ['consent_sms', 'Consent SMS', 'ConsentSms', 'ConsentSMS'],
  consent_date: ['consent_date', 'Consent Date', 'ConsentDate'],
  data_source: ['data_source', 'Data Source', 'DataSource'],
  created_date: ['created_date', 'Created Date', 'CreatedDate'],
  last_modified_date: ['last_modified_date', 'Last Modified Date', 'LastModifiedDate', 'Modified'],
  deletion_requested: ['deletion_requested', 'Deletion Requested', 'DeletionRequested'],
};

const BIODATA_WRITE_KEYS: BiodataLogicalKey[] = [
  'Title',
  'contact_id',
  'full_name',
  'preferred_name',
  'current_company',
  'job_title',
  'salutation',
  'gender',
  'date_of_birth',
  'profile_photo_url',
  'record_status',
  'nationality',
  'birth_country',
  'birth_state',
  'hometown',
  'ethnicity',
  'religion',
  'languages_spoken',
  'education',
  'certifications',
  'work_history',
  'board_positions',
  'preferred_channels',
  'preferred_contact_time',
  'preferred_meeting_format',
  'communication_formality',
  'gatekeeper_name',
  'gatekeeper_phone',
  'comms_notes',
  'personal_interests',
  'motivators',
  'decision_making_style',
  'referral_source',
  'known_associates',
  'sensitivity_flags',
  'account_notes',
  'consent_email',
  'consent_sms',
  'consent_date',
  'data_source',
  'created_date',
  'last_modified_date',
  'deletion_requested',
];

function normalizeFieldAlias(value: string): string {
  return String(value || '')
    .replace(/_x0020_/gi, ' ')
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

function isDateField(field?: BiodataFieldBinding): boolean {
  return Boolean(field && /date/i.test(field.type));
}

function isBooleanField(field?: BiodataFieldBinding): boolean {
  return Boolean(field && /boolean/i.test(field.type));
}

function isUserField(field?: BiodataFieldBinding): boolean {
  return Boolean(field && /user/i.test(field.type));
}

function isUrlField(field?: BiodataFieldBinding): boolean {
  return Boolean(field && /url/i.test(field.type));
}

async function resolveBiodataSchema(webUrl: string): Promise<BiodataSchema> {
  const fields = await getFieldMetadata(webUrl, LISTS.biodata);
  const schema: BiodataSchema = {};
  const lookup = new Map<string, SharePointFieldInfo>();
  fields.forEach((field) => {
    lookup.set(normalizeFieldAlias(field.InternalName), field);
    lookup.set(normalizeFieldAlias(field.Title), field);
  });

  (Object.keys(BIODATA_FIELD_CANDIDATES) as BiodataLogicalKey[]).forEach((key) => {
    const candidates = BIODATA_FIELD_CANDIDATES[key] || [];
    const match = candidates
      .map((candidate) => lookup.get(normalizeFieldAlias(candidate)))
      .find(Boolean);
    if (match) {
      schema[key] = {
        internalName: match.InternalName,
        title: match.Title,
        type: match.TypeAsString,
      };
    }
  });

  if (!schema.contact_id) {
    schema.contact_id = {
      internalName: 'Contact_x0020_Id',
      title: 'Contact Id',
      type: 'Text',
    };
  }

  return schema;
}

function getBiodataItemValue(item: any, schema: BiodataSchema, key: BiodataLogicalKey): any {
  const field = schema[key];
  if (field && Object.prototype.hasOwnProperty.call(item, field.internalName)) {
    return item[field.internalName];
  }
  const candidates = [key, ...(BIODATA_FIELD_CANDIDATES[key] || [])];
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(item, candidate)) return item[candidate];
    const normalized = normalizeFieldAlias(candidate);
    const actualKey = Object.keys(item || {}).find((itemKey) => normalizeFieldAlias(itemKey) === normalized);
    if (actualKey) return item[actualKey];
  }
  return undefined;
}

function setBiodataPayloadField(
  payload: Record<string, any>,
  schema: BiodataSchema,
  key: BiodataLogicalKey,
  value: any,
): void {
  const field = schema[key];
  if (!field) return;
  if (isUserField(field)) return;
  if (isBooleanField(field)) {
    payload[field.internalName] = coerceBoolean(value);
    return;
  }
  if (isDateField(field)) {
    payload[field.internalName] = value ? String(value) : null;
    return;
  }
  if (isUrlField(field)) {
    const url = String(value || '').trim();
    payload[field.internalName] = url ? { Url: url, Description: field.title || 'Profile Photo' } : null;
    return;
  }
  payload[field.internalName] = value === undefined || value === null ? '' : value;
}

function buildBiodataPayload(
  schema: BiodataSchema,
  data: Record<string, any>,
  recordOwnerNumericId: number,
): Record<string, any> {
  const payload: Record<string, any> = {};
  BIODATA_WRITE_KEYS.forEach((key) => {
    setBiodataPayloadField(payload, schema, key, data[key]);
  });

  if (!payload.Title) {
    payload.Title = data.Title || data.full_name || `Biodata ${data.contact_id || ''}`.trim();
  }

  const ownerField = schema.record_owner;
  if (ownerField && isUserField(ownerField) && recordOwnerNumericId > 0) {
    payload[`${ownerField.internalName}Id`] = recordOwnerNumericId;
  }

  return payload;
}

function biodataFilterEquals(field: BiodataFieldBinding, value: string): string {
  const safeValue = String(value || '').replace(/'/g, "''");
  if (/number|integer|counter/i.test(field.type)) return `${field.internalName} eq ${Number(safeValue) || 0}`;
  return `${field.internalName} eq '${safeValue}'`;
}

function absoluteSharePointUrl(webUrl: string, value: string): string {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = String(webUrl || '').replace(/\/$/, '');
  const normalized = url.startsWith('/') ? url : `/${url}`;
  try {
    return new URL(normalized, base).href;
  } catch {
    return `${base}${normalized}`;
  }
}

const CLIENT_PHOTO_FIELD_CANDIDATES = ['PhotoUrl', 'ProfilePhoto', 'ProfilePhotoUrl', 'Photo', 'PictureUrl', 'PictureURL', 'UserPhoto'];
const clientPhotoFieldCache: Record<string, Promise<string | null>> = {};
const CLIENT_BIRTHDAY_FIELD_CANDIDATES = ['BirthdayDate', 'Birthday Date', 'BirthDate', 'Birth Date', 'DateOfBirth', 'Date Of Birth', 'DOB', 'Birthday'];
const clientBirthdayFieldCache: Record<string, Promise<string | null>> = {};

async function resolveClientPhotoFieldName(webUrl: string): Promise<string | null> {
  if (!clientPhotoFieldCache[webUrl]) {
    clientPhotoFieldCache[webUrl] = (async () => {
      const fields = await getFieldMetadata(webUrl, 'KRI_Clients');
      const lookup = new Map<string, SharePointFieldInfo>();
      fields.forEach((field) => {
        lookup.set(normalizeFieldAlias(field.InternalName), field);
        lookup.set(normalizeFieldAlias(field.Title), field);
      });
      for (const candidate of CLIENT_PHOTO_FIELD_CANDIDATES) {
        const match = lookup.get(normalizeFieldAlias(candidate));
        if (match) return match.InternalName;
      }
      return null;
    })();
  }
  return clientPhotoFieldCache[webUrl];
}

async function resolveClientBirthdayFieldName(webUrl: string): Promise<string | null> {
  if (!clientBirthdayFieldCache[webUrl]) {
    clientBirthdayFieldCache[webUrl] = (async () => {
      const fields = await getFieldMetadata(webUrl, 'KRI_Clients');
      const lookup = new Map<string, SharePointFieldInfo>();
      fields.forEach((field) => {
        lookup.set(normalizeFieldAlias(field.InternalName), field);
        lookup.set(normalizeFieldAlias(field.Title), field);
      });
      for (const candidate of CLIENT_BIRTHDAY_FIELD_CANDIDATES) {
        const match = lookup.get(normalizeFieldAlias(candidate));
        if (match) return match.InternalName;
      }
      return null;
    })();
  }
  return clientBirthdayFieldCache[webUrl];
}

async function syncBiodataToClient(
  webUrl: string,
  digest: string,
  contactId: string,
  record: Partial<BiodataRecord>,
): Promise<void> {
  const fields: Record<string, any> = {};
  const fullName = normalizeLookupText(record.full_name || record.Title || '');
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      fields.FirstName = parts.slice(0, -1).join(' ');
      fields.LastName = parts[parts.length - 1];
    } else {
      fields.FirstName = fullName;
      fields.LastName = fullName;
    }
    fields.Title = fullName;
  }
  if (record.gender) fields.Gender = record.gender;
  if (record.current_company) fields.CompanyName = record.current_company;
  if (record.job_title) fields.JobTitle = record.job_title;
  if (record.date_of_birth) {
    const birthdayField = await resolveClientBirthdayFieldName(webUrl).catch(() => null);
    const normalizedBirthday = normalizeDateOnlyText(record.date_of_birth);
    if (birthdayField) fields[birthdayField] = normalizedBirthday;
    else fields.BirthdayDate = normalizedBirthday;
  }
  if (record.profile_photo_url) {
    const photoField = await resolveClientPhotoFieldName(webUrl).catch(() => null);
    if (photoField) fields[photoField] = record.profile_photo_url;
    else fields.PhotoUrl = record.profile_photo_url;
  }
  if (!Object.keys(fields).length) return;
  await updateListItem(webUrl, digest, 'KRI_Clients', contactId, fields).catch((error) => {
    console.warn('[sharepointProvisioning] Client mirror update failed:', error);
  });
}

export async function getClientBiodataRecord(context: WebPartContext, contactId: string): Promise<BiodataRecord | null> {
  const webUrl = resolveKriDataSiteUrl(context);
  const safeId = String(contactId || '').trim();
  if (!safeId) return null;
  const schema = await resolveBiodataSchema(webUrl);
  const contactField = schema.contact_id;
  if (!contactField) return null;
  const modifiedField = schema.last_modified_date?.internalName || 'Modified';
  const orderBy = modifiedField ? `&$orderby=${modifiedField} desc` : '';
  const data = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.biodata)}/items?$select=*&$filter=${biodataFilterEquals(contactField, safeId)}${orderBy}&$top=1`
  ).catch(() => ({ value: [] }));
  const item = (data.value || [])[0];
  if (!item) return null;
  const attachments = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.biodata)}/items(${item.Id || item.ID})/AttachmentFiles?$select=FileName,ServerRelativeUrl`
  ).catch(() => ({ value: [] }));
  const attachmentFiles = attachments?.value || attachments?.d?.results || [];
  const attachmentPhoto = (attachmentFiles || [])
    .map((attachment: any) => String(attachment?.ServerRelativeUrl || attachment?.serverRelativeUrl || ''))
    .find((url: string) => !!url);
  const photoValue = getBiodataItemValue(item, schema, 'profile_photo_url');
  const profilePhotoUrl = typeof photoValue === 'object'
    ? String(photoValue?.Url || photoValue?.url || attachmentPhoto || '')
    : String(photoValue || attachmentPhoto || '');
  return {
    ID: String(item.Id || item.ID || ''),
    Title: String(getBiodataItemValue(item, schema, 'Title') || getBiodataItemValue(item, schema, 'full_name') || item.Title || ''),
    contact_id: String(getBiodataItemValue(item, schema, 'contact_id') || ''),
    full_name: String(getBiodataItemValue(item, schema, 'full_name') || item.Title || ''),
    preferred_name: String(getBiodataItemValue(item, schema, 'preferred_name') || ''),
    salutation: String(getBiodataItemValue(item, schema, 'salutation') || ''),
    gender: String(getBiodataItemValue(item, schema, 'gender') || ''),
    current_company: String(getBiodataItemValue(item, schema, 'current_company') || ''),
    job_title: String(getBiodataItemValue(item, schema, 'job_title') || ''),
    date_of_birth: normalizeDateOnlyText(getBiodataItemValue(item, schema, 'date_of_birth') || ''),
    profile_photo_url: profilePhotoUrl,
    record_status: String(getBiodataItemValue(item, schema, 'record_status') || 'Active'),
    record_owner: getBiodataItemValue(item, schema, 'record_owner'),
    nationality: String(getBiodataItemValue(item, schema, 'nationality') || ''),
    birth_country: String(getBiodataItemValue(item, schema, 'birth_country') || ''),
    birth_state: String(getBiodataItemValue(item, schema, 'birth_state') || ''),
    hometown: String(getBiodataItemValue(item, schema, 'hometown') || ''),
    ethnicity: String(getBiodataItemValue(item, schema, 'ethnicity') || ''),
    religion: String(getBiodataItemValue(item, schema, 'religion') || ''),
    languages_spoken: normalizeJsonText(getBiodataItemValue(item, schema, 'languages_spoken') || ''),
    education: normalizeJsonText(getBiodataItemValue(item, schema, 'education') || ''),
    certifications: normalizeJsonText(getBiodataItemValue(item, schema, 'certifications') || ''),
    work_history: normalizeJsonText(getBiodataItemValue(item, schema, 'work_history') || ''),
    board_positions: normalizeJsonText(getBiodataItemValue(item, schema, 'board_positions') || ''),
    preferred_channels: normalizeJsonText(getBiodataItemValue(item, schema, 'preferred_channels') || ''),
    preferred_contact_time: String(getBiodataItemValue(item, schema, 'preferred_contact_time') || ''),
    preferred_meeting_format: String(getBiodataItemValue(item, schema, 'preferred_meeting_format') || ''),
    communication_formality: String(getBiodataItemValue(item, schema, 'communication_formality') || ''),
    gatekeeper_name: String(getBiodataItemValue(item, schema, 'gatekeeper_name') || ''),
    gatekeeper_phone: String(getBiodataItemValue(item, schema, 'gatekeeper_phone') || ''),
    comms_notes: String(getBiodataItemValue(item, schema, 'comms_notes') || ''),
    personal_interests: normalizeJsonText(getBiodataItemValue(item, schema, 'personal_interests') || ''),
    motivators: normalizeJsonText(getBiodataItemValue(item, schema, 'motivators') || ''),
    decision_making_style: String(getBiodataItemValue(item, schema, 'decision_making_style') || ''),
    referral_source: String(getBiodataItemValue(item, schema, 'referral_source') || ''),
    known_associates: normalizeJsonText(getBiodataItemValue(item, schema, 'known_associates') || ''),
    sensitivity_flags: normalizeJsonText(getBiodataItemValue(item, schema, 'sensitivity_flags') || ''),
    account_notes: String(getBiodataItemValue(item, schema, 'account_notes') || ''),
    consent_email: coerceBoolean(getBiodataItemValue(item, schema, 'consent_email')),
    consent_sms: coerceBoolean(getBiodataItemValue(item, schema, 'consent_sms')),
    consent_date: String(getBiodataItemValue(item, schema, 'consent_date') || ''),
    data_source: String(getBiodataItemValue(item, schema, 'data_source') || ''),
    created_date: String(getBiodataItemValue(item, schema, 'created_date') || ''),
    last_modified_date: String(getBiodataItemValue(item, schema, 'last_modified_date') || ''),
    deletion_requested: coerceBoolean(getBiodataItemValue(item, schema, 'deletion_requested')),
  };
}

export async function saveClientBiodataRecord(
  context: WebPartContext,
  contactId: string,
  payload: Partial<BiodataRecord>,
  profilePhotoFile?: File | null
): Promise<BiodataRecord> {
  const webUrl = resolveKriDataSiteUrl(context);
  const digest = await getRequestDigest(webUrl);
  const schema = await resolveBiodataSchema(webUrl);
  const safeId = String(contactId || '').trim();
  if (!safeId) throw new Error('Missing contact id');
  const fullName = String(payload.full_name || payload.Title || '').trim();
  // Resolve numeric site user ID — required for SharePoint Person/Group fields
  let recordOwnerNumericId = 0;
  try {
    const cu = await getJson(webUrl, `${webUrl}/_api/web/currentuser?$select=Id`).catch(() => null);
    recordOwnerNumericId = Number(cu?.Id || cu?.id || 0);
  } catch {
    // best-effort — proceed without setting owner
  }
  const data: Record<string, any> = {
    Title: fullName || `Biodata ${safeId}`,
    contact_id: safeId,
    full_name: fullName || `Contact ${safeId}`,
    preferred_name: payload.preferred_name || '',
    salutation: payload.salutation || '',
    gender: payload.gender || '',
    current_company: payload.current_company || '',
    job_title: payload.job_title || '',
    date_of_birth: normalizeDateOnlyText(payload.date_of_birth || ''),
    profile_photo_url: payload.profile_photo_url || '',
    record_status: payload.record_status || 'Active',
    ...(recordOwnerNumericId > 0 ? { record_ownerId: recordOwnerNumericId } : {}),
    nationality: payload.nationality || '',
    birth_country: payload.birth_country || '',
    birth_state: payload.birth_state || '',
    hometown: payload.hometown || '',
    ethnicity: payload.ethnicity || '',
    religion: payload.religion || '',
    languages_spoken: normalizeJsonText(payload.languages_spoken || ''),
    education: normalizeJsonText(payload.education || ''),
    certifications: normalizeJsonText(payload.certifications || ''),
    work_history: normalizeJsonText(payload.work_history || ''),
    board_positions: normalizeJsonText(payload.board_positions || ''),
    preferred_channels: normalizeJsonText(payload.preferred_channels || ''),
    preferred_contact_time: payload.preferred_contact_time || '',
    preferred_meeting_format: payload.preferred_meeting_format || '',
    communication_formality: payload.communication_formality || '',
    gatekeeper_name: payload.gatekeeper_name || '',
    gatekeeper_phone: payload.gatekeeper_phone || '',
    comms_notes: payload.comms_notes || '',
    personal_interests: normalizeJsonText(payload.personal_interests || ''),
    motivators: normalizeJsonText(payload.motivators || ''),
    decision_making_style: payload.decision_making_style || '',
    referral_source: payload.referral_source || '',
    known_associates: normalizeJsonText(payload.known_associates || ''),
    sensitivity_flags: normalizeJsonText(payload.sensitivity_flags || ''),
    account_notes: payload.account_notes || '',
    consent_email: coerceBoolean(payload.consent_email),
    consent_sms: coerceBoolean(payload.consent_sms),
    consent_date: payload.consent_date || '',
    data_source: payload.data_source || 'Manual',
    created_date: payload.created_date || new Date().toISOString(),
    last_modified_date: new Date().toISOString(),
    deletion_requested: coerceBoolean(payload.deletion_requested),
  };
  const sharePointPayload = buildBiodataPayload(schema, data, recordOwnerNumericId);

  const existing = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.biodata)}/items?$select=Id,${schema.contact_id.internalName}&$filter=${biodataFilterEquals(schema.contact_id, safeId)}&$top=1`
  ).catch(() => ({ value: [] }));
  const current = existing?.value?.[0];
  if (current?.Id) {
    await updateListItem(webUrl, digest, LISTS.biodata, current.Id, sharePointPayload);
    const existingRecord = {
      ID: String(current.Id),
      Title: data.Title,
      contact_id: safeId,
      full_name: data.full_name,
      preferred_name: data.preferred_name,
      salutation: data.salutation,
      gender: data.gender,
      current_company: data.current_company,
      job_title: data.job_title,
      date_of_birth: normalizeDateOnlyText(data.date_of_birth),
      profile_photo_url: data.profile_photo_url,
      record_status: data.record_status,
      record_owner: null,
      nationality: data.nationality,
      birth_country: data.birth_country,
      birth_state: data.birth_state,
      hometown: data.hometown,
      ethnicity: data.ethnicity,
      religion: data.religion,
      languages_spoken: data.languages_spoken,
      education: data.education,
      certifications: data.certifications,
      work_history: data.work_history,
      board_positions: data.board_positions,
      preferred_channels: data.preferred_channels,
      preferred_contact_time: data.preferred_contact_time,
      preferred_meeting_format: data.preferred_meeting_format,
      communication_formality: data.communication_formality,
      gatekeeper_name: data.gatekeeper_name,
      gatekeeper_phone: data.gatekeeper_phone,
      comms_notes: data.comms_notes,
      personal_interests: data.personal_interests,
      motivators: data.motivators,
      decision_making_style: data.decision_making_style,
      referral_source: data.referral_source,
      known_associates: data.known_associates,
      sensitivity_flags: data.sensitivity_flags,
      account_notes: data.account_notes,
      consent_email: data.consent_email,
      consent_sms: data.consent_sms,
      consent_date: data.consent_date,
      data_source: data.data_source,
      created_date: data.created_date,
      last_modified_date: data.last_modified_date,
      deletion_requested: data.deletion_requested,
    } as BiodataRecord;
    if (!profilePhotoFile) {
      await syncBiodataToClient(webUrl, digest, safeId, existingRecord);
      return existingRecord;
    }
    try {
      return await saveBiodataPhotoAttachment(webUrl, digest, current.Id, existingRecord, profilePhotoFile);
    } catch (error) {
      console.warn('[sharepointProvisioning] Biodata photo attachment save failed:', error);
      return existingRecord;
    }
  }

  const created = await ensureListItem(webUrl, digest, LISTS.biodata, sharePointPayload);
  const createdRecord = {
    ID: String(created?.Id || created?.ID || ''),
    ...data,
  } as BiodataRecord;
  if (!profilePhotoFile) {
    await syncBiodataToClient(webUrl, digest, safeId, createdRecord);
    return createdRecord;
  }
  try {
    return await saveBiodataPhotoAttachment(webUrl, digest, created?.Id || created?.ID || createdRecord.ID, createdRecord, profilePhotoFile);
  } catch (error) {
    console.warn('[sharepointProvisioning] Biodata photo attachment save failed:', error);
    return createdRecord;
  }
}

async function saveBiodataPhotoAttachment(
  webUrl: string,
  digest: string,
  itemId: string | number,
  record: BiodataRecord,
  file: File
): Promise<BiodataRecord> {
  const safeId = String(itemId || '').trim();
  if (!safeId) return record;
  const attachmentName = `profile-photo${(file.name.match(/\.[^.]+$/)?.[0] || '.jpg')}`;
  const attachments = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.biodata)}/items(${safeId})/AttachmentFiles?$select=FileName,ServerRelativeUrl`
  ).catch(() => ({ value: [] }));
  const attachmentFiles = attachments?.value || attachments?.d?.results || [];
  for (const attachment of attachmentFiles) {
    const fileName = String(attachment?.FileName || attachment?.Name || '').trim();
    if (!fileName.toLowerCase().startsWith('profile-photo')) continue;
    try {
      for (const attempt of requestAttempts(webUrl, `${listUrl(webUrl, LISTS.biodata)}/items(${safeId})/AttachmentFiles/getByFileName('${fileName.replace(/'/g, "''")}')`)) {
        const response = await fetch(attempt, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json;odata=nometadata',
            'X-RequestDigest': digest,
            'X-HTTP-Method': 'DELETE',
            'IF-MATCH': '*',
          },
        });
        if (response.ok || response.status === 404) break;
      }
    } catch {
      // Best effort cleanup.
    }
  }

  const bytes = await file.arrayBuffer();
  let uploadResponse: Response | null = null;
  let uploadError: unknown = null;
  for (const attempt of requestAttempts(webUrl, `${listUrl(webUrl, LISTS.biodata)}/items(${safeId})/AttachmentFiles/add(FileName='${attachmentName.replace(/'/g, "''")}')`)) {
    try {
      const response = await fetch(attempt, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json;odata=nometadata',
          'X-RequestDigest': digest,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: bytes,
      });
      if (!response.ok) {
        throw new Error(`Biodata photo upload failed (${response.status})`);
      }
      uploadResponse = response;
      break;
    } catch (error) {
      uploadError = error;
    }
  }
  if (!uploadResponse) {
    throw uploadError || new Error(`Biodata photo upload failed for ${safeId}`);
  }

  const sitePath = new URL(webUrl).pathname.replace(/\/$/, '');
  const expectedServerRelativeUrl = `${sitePath}/Lists/${LISTS.biodata}/Attachments/${safeId}/${attachmentName}`;
  let resolvedUrl = '';
  const uploadJson = await uploadResponse.json().catch(() => null);
  resolvedUrl = String(uploadJson?.ServerRelativeUrl || uploadJson?.serverRelativeUrl || uploadJson?.d?.ServerRelativeUrl || uploadJson?.d?.serverRelativeUrl || '').trim();

  const attachmentState = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.biodata)}/items(${safeId})/AttachmentFiles?$select=FileName,ServerRelativeUrl`
  ).catch(() => ({ value: [] }));
  const latest = (attachmentState?.value || attachmentState?.d?.results || [])
    .find((attachment: any) => String(attachment?.FileName || '').trim().toLowerCase() === attachmentName.toLowerCase());
  if (!resolvedUrl) {
    resolvedUrl = String(latest?.ServerRelativeUrl || latest?.serverRelativeUrl || expectedServerRelativeUrl || '').trim();
  }
  if (!resolvedUrl) return record;
  const displayUrl = absoluteSharePointUrl(webUrl, resolvedUrl);
  const schema = await resolveBiodataSchema(webUrl);
  const photoPayload: Record<string, any> = {};
  setBiodataPayloadField(photoPayload, schema, 'profile_photo_url', displayUrl);
  setBiodataPayloadField(photoPayload, schema, 'last_modified_date', new Date().toISOString());

  if (Object.keys(photoPayload).length) {
    try {
      await updateListItem(webUrl, digest, LISTS.biodata, safeId, photoPayload);
    } catch (error) {
      console.warn('[sharepointProvisioning] Biodata photo field sync failed:', error);
    }
  }

  // Mirror the photo URL back to KRI_Clients.PhotoUrl so it propagates app-wide
  // (mirrors the KRI_Users.ProfilePhoto pattern used by the leaderboard and shell)
  const contactId = String(record.contact_id || '').trim();
  if (contactId) await syncBiodataToClient(webUrl, digest, contactId, { ...record, profile_photo_url: displayUrl });

  const confirmedItem = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.biodata)}/items(${safeId})?$select=*`
  ).catch(() => null);
  if (confirmedItem) {
    const confirmedAttachments = await getJson(
      webUrl,
      `${listUrl(webUrl, LISTS.biodata)}/items(${safeId})/AttachmentFiles?$select=FileName,ServerRelativeUrl`
    ).catch(() => ({ value: [] }));
    const confirmedAttachmentPhoto = (confirmedAttachments?.value || confirmedAttachments?.d?.results || [])
      .map((attachment: any) => String(attachment?.ServerRelativeUrl || attachment?.serverRelativeUrl || ''))
      .find((url: string) => !!url);
    const confirmedSchema = await resolveBiodataSchema(webUrl);
    const confirmedPhotoValue = getBiodataItemValue(confirmedItem, confirmedSchema, 'profile_photo_url');
    const confirmedPhotoUrl = typeof confirmedPhotoValue === 'object'
      ? String(confirmedPhotoValue?.Url || confirmedPhotoValue?.url || confirmedAttachmentPhoto || displayUrl || '')
      : String(confirmedPhotoValue || confirmedAttachmentPhoto || displayUrl || '');
    return {
      ...record,
      profile_photo_url: confirmedPhotoUrl,
    };
  }

  return {
    ...record,
    profile_photo_url: displayUrl,
  };
}

