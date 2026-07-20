import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getClients, IClient } from './graphApi';

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
};

export function listUrl(webUrl: string, listName: string): string {
  return `${webUrl}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')`;
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function getRequestDigest(webUrl: string): Promise<string> {
  const response = await fetch(`${webUrl}/_api/contextinfo`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'odata-version': '',
    },
  });
  if (!response.ok) throw new Error(`Could not obtain request digest (${response.status})`);
  const json = await response.json();
  return json?.FormDigestValue || json?.d?.GetContextWebInformation?.FormDigestValue || '';
}

export async function getJson(webUrl: string, url: string): Promise<any> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'odata-version': '',
    },
  });
  if (!response.ok) throw new Error(`GET failed (${response.status}) for ${url}`);
  return response.json();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listExists(webUrl: string, title: string): Promise<boolean> {
  try {
    await getJson(webUrl, `${listUrl(webUrl, title)}?$select=Id,Title`);
    return true;
  } catch {
    return false;
  }
}

export async function waitForListAvailability(webUrl: string, title: string, attempts = 8, delayMs = 750): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await listExists(webUrl, title)) return;
    await sleep(delayMs * (attempt + 1));
  }
}

export async function createList(webUrl: string, digest: string, title: string, description: string, baseTemplate = 100): Promise<boolean> {
  if (await listExists(webUrl, title)) return false;
  const response = await fetch(`${webUrl}/_api/web/lists`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
    },
    body: JSON.stringify({
      Title: title,
      Description: description,
      BaseTemplate: baseTemplate,
    }),
  });
  if (!response.ok && response.status !== 409) {
    const details = await response.text().catch(() => '');
    throw new Error(`Create list failed for ${title} (${response.status})${details ? `: ${details}` : ''}`);
  }
  return response.ok;
}

export async function getFieldMap(webUrl: string, title: string): Promise<Record<string, string>> {
  try {
    const data = await getJson(webUrl, `${listUrl(webUrl, title)}/fields?$select=InternalName,TypeAsString&$filter=Hidden eq false&$top=500`);
    const map: Record<string, string> = {};
    (data.value || []).forEach((field: any) => {
      map[String(field.InternalName)] = String(field.TypeAsString || '');
    });
    return map;
  } catch {
    return {};
  }
}

export function fieldXmlText(name: string, displayName: string, required = false, maxLength = 255): string {
  return `<Field Type="Text" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" MaxLength="${maxLength}" />`;
}

export function fieldXmlNote(name: string, displayName: string, required = false, richText = false): string {
  return `<Field Type="Note" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" NumLines="6" RichText="${richText ? 'TRUE' : 'FALSE'}" AppendOnly="FALSE" />`;
}

export function fieldXmlChoice(name: string, displayName: string, choices: string[], required = false, multi = false): string {
  const choiceXml = choices.map((choice) => `<CHOICE>${escapeXml(choice)}</CHOICE>`).join('');
  return `<Field Type="${multi ? 'MultiChoice' : 'Choice'}" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}"><CHOICES>${choiceXml}</CHOICES></Field>`;
}

export function fieldXmlBoolean(name: string, displayName: string, required = false): string {
  return `<Field Type="Boolean" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" />`;
}

export function fieldXmlDate(name: string, displayName: string, required = false): string {
  return `<Field Type="DateTime" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" Format="DateOnly" />`;
}

export function fieldXmlUrl(name: string, displayName: string, required = false): string {
  return `<Field Type="URL" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" Format="Hyperlink" />`;
}

export function fieldXmlUser(name: string, displayName: string, required = false): string {
  return `<Field Type="User" DisplayName="${escapeXml(displayName)}" Name="${escapeXml(name)}" StaticName="${escapeXml(name)}" Required="${required ? 'TRUE' : 'FALSE'}" List="UserInfo" UserSelectionMode="PeopleOnly" />`;
}

export async function ensureField(webUrl: string, digest: string, listName: string, internalName: string, schemaXml: string, fieldMap: Record<string, string>): Promise<boolean> {
  if (fieldMap[internalName]) return false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${listUrl(webUrl, listName)}/fields/CreateFieldAsXml`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json;odata=nometadata',
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
    if (response.ok || response.status === 409) {
      return response.ok;
    }
    if (response.status === 404 && attempt < 3) {
      await waitForListAvailability(webUrl, listName, 2, 500);
      continue;
    }
    const details = await response.text().catch(() => '');
    throw new Error(`Create field failed for ${listName}.${internalName} (${response.status})${details ? `: ${details}` : ''}`);
  }
  return false;
}

export async function ensureListWithFields(
  webUrl: string,
  digest: string,
  title: string,
  description: string,
  fieldDefinitions: Array<{ name: string; xml: string }>
): Promise<ProvisionStep> {
  const created = await createList(webUrl, digest, title, description);
  if (created) {
    await waitForListAvailability(webUrl, title);
  }
  let fieldMap = await getFieldMap(webUrl, title);
  if (!Object.keys(fieldMap).length) {
    await waitForListAvailability(webUrl, title, 10, 500);
    fieldMap = await getFieldMap(webUrl, title);
  }
  const fieldsCreated: string[] = [];
  for (const field of fieldDefinitions) {
    const added = await ensureField(webUrl, digest, title, field.name, field.xml, fieldMap);
    if (added) fieldsCreated.push(field.name);
  }
  return { title, created, fieldsCreated };
}

async function setListAttachmentsEnabled(webUrl: string, digest: string, title: string, enabled: boolean): Promise<void> {
  const response = await fetch(`${listUrl(webUrl, title)}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
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
    await ensureAttachmentEnabledList(webUrl, digest, LISTS.acumen, 'Company-level acumen uploads and reference files.', companyAcumenFields());
    return;
  }
  if (title === LISTS.biodata) {
    await ensureAttachmentEnabledList(webUrl, digest, LISTS.biodata, 'Detailed client biodata registry for future enrichment.', biodataFields());
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

async function ensureAttachmentEnabledList(webUrl: string, digest: string, title: string, description: string, fields: Array<{ name: string; xml: string }>): Promise<ProvisionStep> {
  const step = await ensureListWithFields(webUrl, digest, title, description, fields);
  await setListAttachmentsEnabled(webUrl, digest, title, true);
  return step;
}

// provisionKriSharePointLists removed — all SharePoint lists are already provisioned.


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
  const webUrl = context.pageContext.web.absoluteUrl;
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

export async function ensureListItem(webUrl: string, digest: string, listName: string, fields: Record<string, any>): Promise<any> {
  const response = await fetch(`${listUrl(webUrl, listName)}/items`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
    },
    body: JSON.stringify(fields),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch { /* ignore */ }
    throw new Error(`Create item failed for ${listName} (${response.status}): ${detail}`);
  }
  return response.json();
}

export async function deleteListItem(webUrl: string, digest: string, listName: string, itemId: string | number): Promise<void> {
  const safeId = String(itemId || '').trim();
  if (!safeId) return;
  const response = await fetch(`${listUrl(webUrl, listName)}/items(${safeId})`, {
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
}

export async function upsertCompanyRegistryRecord(
  context: WebPartContext,
  companyKey: string,
  companyName: string,
  contactCount = 0,
  summary = ''
): Promise<void> {
  const webUrl = context.pageContext.web.absoluteUrl;
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
    await fetch(`${listUrl(webUrl, LISTS.companies)}/items(${current.Id})`, {
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
  const webUrl = context.pageContext.web.absoluteUrl;
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
  const webUrl = context.pageContext.web.absoluteUrl;
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

function normalizeJsonText(value: any): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function coerceBoolean(value: any): boolean {
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
  const webUrl = context.pageContext.web.absoluteUrl;
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

export async function getClientBiodataRecord(context: WebPartContext, contactId: string): Promise<BiodataRecord | null> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const safeId = String(contactId || '').trim();
  if (!safeId) return null;
  const data = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.biodata)}/items?$select=*&$filter=contact_id eq '${safeId.replace(/'/g, "''")}'&$orderby=last_modified_date desc&$top=1`
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
  return {
    ID: String(item.Id || item.ID || ''),
    Title: String(item.Title || item.full_name || ''),
    contact_id: String(item.contact_id || ''),
    full_name: String(item.full_name || ''),
    preferred_name: String(item.preferred_name || ''),
    salutation: String(item.salutation || ''),
    gender: String(item.gender || ''),
    current_company: String(item.current_company || ''),
    job_title: String(item.job_title || ''),
    date_of_birth: String(item.date_of_birth || ''),
    profile_photo_url: String(item.profile_photo_url || attachmentPhoto || ''),
    record_status: String(item.record_status || 'Active'),
    record_owner: item.record_owner,
    nationality: String(item.nationality || ''),
    birth_country: String(item.birth_country || ''),
    birth_state: String(item.birth_state || ''),
    hometown: String(item.hometown || ''),
    ethnicity: String(item.ethnicity || ''),
    religion: String(item.religion || ''),
    languages_spoken: normalizeJsonText(item.languages_spoken || ''),
    education: normalizeJsonText(item.education || ''),
    certifications: normalizeJsonText(item.certifications || ''),
    work_history: normalizeJsonText(item.work_history || ''),
    board_positions: normalizeJsonText(item.board_positions || ''),
    preferred_channels: normalizeJsonText(item.preferred_channels || ''),
    preferred_contact_time: String(item.preferred_contact_time || ''),
    preferred_meeting_format: String(item.preferred_meeting_format || ''),
    communication_formality: String(item.communication_formality || ''),
    gatekeeper_name: String(item.gatekeeper_name || ''),
    gatekeeper_phone: String(item.gatekeeper_phone || ''),
    comms_notes: String(item.comms_notes || ''),
    personal_interests: normalizeJsonText(item.personal_interests || ''),
    motivators: normalizeJsonText(item.motivators || ''),
    decision_making_style: String(item.decision_making_style || ''),
    referral_source: String(item.referral_source || ''),
    known_associates: normalizeJsonText(item.known_associates || ''),
    sensitivity_flags: normalizeJsonText(item.sensitivity_flags || ''),
    account_notes: String(item.account_notes || ''),
    consent_email: coerceBoolean(item.consent_email),
    consent_sms: coerceBoolean(item.consent_sms),
    consent_date: String(item.consent_date || ''),
    data_source: String(item.data_source || ''),
    created_date: String(item.created_date || ''),
    last_modified_date: String(item.last_modified_date || ''),
    deletion_requested: coerceBoolean(item.deletion_requested),
  };
}

export async function saveClientBiodataRecord(
  context: WebPartContext,
  contactId: string,
  payload: Partial<BiodataRecord>,
  profilePhotoFile?: File | null
): Promise<BiodataRecord> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  await ensureRuntimeStorageReady(webUrl, digest, LISTS.biodata);
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
    date_of_birth: payload.date_of_birth || '',
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

  const existing = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.biodata)}/items?$select=Id,contact_id&$filter=contact_id eq '${safeId.replace(/'/g, "''")}'&$top=1`
  ).catch(() => ({ value: [] }));
  const current = existing?.value?.[0];
  if (current?.Id) {
    const updateResponse = await fetch(`${listUrl(webUrl, LISTS.biodata)}/items(${current.Id})`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'X-RequestDigest': digest,
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE',
      },
      body: JSON.stringify(data),
    });
    if (!updateResponse.ok && updateResponse.status !== 204) {
      let detail = '';
      try { detail = await updateResponse.text(); } catch { /* ignore */ }
      throw new Error(`Update biodata item failed (${updateResponse.status}): ${detail}`);
    }
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
      date_of_birth: data.date_of_birth,
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
      return existingRecord;
    }
    return await saveBiodataPhotoAttachment(webUrl, digest, current.Id, existingRecord, profilePhotoFile);
  }

  const created = await ensureListItem(webUrl, digest, LISTS.biodata, data);
  const createdRecord = {
    ID: String(created?.Id || created?.ID || ''),
    ...data,
  } as BiodataRecord;
  if (!profilePhotoFile) {
    return createdRecord;
  }
  return await saveBiodataPhotoAttachment(webUrl, digest, created?.Id || created?.ID || createdRecord.ID, createdRecord, profilePhotoFile);
}

async function saveBiodataPhotoAttachment(
  webUrl: string,
  digest: string,
  itemId: string | number,
  record: BiodataRecord,
  file: File
): Promise<BiodataRecord> {
  await ensureRuntimeStorageReady(webUrl, digest, LISTS.biodata);
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
      await fetch(`${listUrl(webUrl, LISTS.biodata)}/items(${safeId})/AttachmentFiles/getByFileName('${fileName.replace(/'/g, "''")}')`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json;odata=nometadata',
          'X-RequestDigest': digest,
          'X-HTTP-Method': 'DELETE',
          'IF-MATCH': '*',
        },
      });
    } catch {
      // Best effort cleanup.
    }
  }

  const bytes = await file.arrayBuffer();
  const uploadResponse = await fetch(`${listUrl(webUrl, LISTS.biodata)}/items(${safeId})/AttachmentFiles/add(FileName='${attachmentName.replace(/'/g, "''")}')`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: bytes,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Biodata photo upload failed (${uploadResponse.status})`);
  }

  const attachmentState = await getJson(
    webUrl,
    `${listUrl(webUrl, LISTS.biodata)}/items(${safeId})/AttachmentFiles?$select=FileName,ServerRelativeUrl`
  ).catch(() => ({ value: [] }));
  const latest = (attachmentState?.value || attachmentState?.d?.results || [])
    .find((attachment: any) => String(attachment?.FileName || '').trim().toLowerCase() === attachmentName.toLowerCase());
  const resolvedUrl = String(latest?.ServerRelativeUrl || latest?.serverRelativeUrl || '').trim();
  if (!resolvedUrl) return record;

  await fetch(`${listUrl(webUrl, LISTS.biodata)}/items(${safeId})`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json;odata=nometadata',
      'Content-Type': 'application/json;odata=nometadata',
      'X-RequestDigest': digest,
      'IF-MATCH': '*',
      'X-HTTP-Method': 'MERGE',
    },
    body: JSON.stringify({
      profile_photo_url: resolvedUrl,
      last_modified_date: new Date().toISOString(),
    }),
  });

  // Mirror the photo URL back to KRI_Clients.PhotoUrl so it propagates app-wide
  // (mirrors the KRI_Users.ProfilePhoto pattern used by the leaderboard and shell)
  const contactId = String(record.contact_id || '').trim();
  if (contactId) {
    await fetch(`${listUrl(webUrl, 'KRI_Clients')}/items(${contactId})`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'X-RequestDigest': digest,
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE',
      },
      body: JSON.stringify({ PhotoUrl: resolvedUrl }),
    }).catch(() => undefined); // best-effort — don't fail the whole save if this errors
  }

  return {
    ...record,
    profile_photo_url: resolvedUrl,
  };
}

export const GEMS_LISTS = {
  interactions: 'GEMS_Interactions',
};

export const GEMS_CATEGORY_POINTS: Record<string, number> = {
  'Crown Jewel': 1,
  Pearl: 5,
  Coral: 3,
  Ruby: 1,
};

const GEMS_CLIENT_FIELD_CANDIDATES = ['ClientId', 'ClientID'] as const;

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

export function normalizeGemsLookupKey(value: string): string {
  return String(value || '').trim().toLowerCase();
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

async function ensureGemsInteractionsReady(webUrl: string, digest: string): Promise<void> {
  await ensureListWithFields(
    webUrl,
    digest,
    GEMS_LISTS.interactions,
    'GEMS interaction intelligence, category scoring, and meeting notes.',
    gemsInteractionFields()
  );
  // Second pass: try direct field creation for any still-missing fields.
  // The CreateFieldAsXml endpoint can fail silently on some tenants.
  const existingFieldMap = await getFieldMap(webUrl, GEMS_LISTS.interactions);
  const missingFields: Array<{ name: string; kind: number }> = [
    { name: 'ClientID', kind: 2 },
    { name: 'ClientName', kind: 2 },
    { name: 'CompanyKey', kind: 2 },
    { name: 'CompanyName', kind: 2 },
    { name: 'InteractionType', kind: 6 },
    { name: 'Category', kind: 6 },
    { name: 'ReviewStatus', kind: 6 },
    { name: 'BusinessArm', kind: 6 },
    { name: 'ExecutiveInvolvementRequested', kind: 8 },
    { name: 'FollowUpRequired', kind: 8 },
    { name: 'ScheduledDate', kind: 4 },
    { name: 'LoggedAt', kind: 4 },
    { name: 'FollowUpDate', kind: 4 },
    { name: 'WeekStart', kind: 4 },
    { name: 'Points', kind: 1 },
    { name: 'InfluencePercent', kind: 1 },
    { name: 'ExecutiveMonthlyPointsAtLog', kind: 1 },
  ];
  for (const fd of missingFields) {
    if (!existingFieldMap[fd.name]) {
      try {
        await fetch(`${listUrl(webUrl, GEMS_LISTS.interactions)}/fields`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json;odata=nometadata',
            'Content-Type': 'application/json;odata=nometadata',
            'X-RequestDigest': digest,
          },
          body: JSON.stringify({
            FieldTypeKind: fd.kind,
            InternalName: fd.name,
            Title: fd.name,
          }),
        });
      } catch { /* field may already exist with different type — ignore */ }
    }
  }
}

export async function getGemsInteractions(context: WebPartContext): Promise<GemsInteractionRecord[]> {
  return getGemsInteractionsWithQuery(context);
}

function normalizeGemsInteraction(item: any): GemsInteractionRecord {
  return {
    ID: String(item.Id || item.ID || ''),
    Title: String(item.Title || ''),
    ClientID: String(item.ClientId || item.ClientID || ''),
    ClientName: String(item.ClientName || ''),
    CompanyKey: String(item.CompanyKey || ''),
    CompanyName: String(item.CompanyName || ''),
    Agency: String(item.Agency || ''),
    BusinessArm: String(item.BusinessArm || ''),
    InteractionType: String(item.InteractionType || 'Meeting'),
    Category: String(item.Category || 'Ruby'),
    FinalClassification: String(item.FinalClassification || item.Category || 'Ruby'),
    InfluencePercent: Number(item.InfluencePercent || 0),
    Points: Number(item.Points || 0),
    Notes: String(item.Notes || ''),
    Justification: String(item.Justification || ''),
    ReviewStatus: String(item.ReviewStatus || 'Submitted'),
    WeekStart: String(item.WeekStart || ''),
    ReportingMonth: String(item.ReportingMonth || ''),
    LoggedBy: String(item.LoggedBy || ''),
    LoggedAt: String(item.LoggedAt || ''),
    TargetUser: String(item.TargetUser || ''),
    TargetUserId: String(item.TargetUserId || ''),
    KRIClassification: String(item.KRIClassification || ''),
    ExecutiveInvolvementRequested: coerceBoolean(item.ExecutiveInvolvementRequested),
    ExecutiveMonthlyPointsAtLog: Number(item.ExecutiveMonthlyPointsAtLog || 0),
    FollowUpRequired: coerceBoolean(item.FollowUpRequired),
    FollowUpDate: String(item.FollowUpDate || ''),
    ScheduledDate: String(item.ScheduledDate || ''),
  };
}

function buildGemsInteractionsQuery(webUrl: string, clientField: string, filter?: string): string {
  const fields = [
    'Id',
    'Title',
    clientField,
    'ClientName',
    'CompanyKey',
    'CompanyName',
    'Agency',
    'BusinessArm',
    'InteractionType',
    'Category',
    'FinalClassification',
    'InfluencePercent',
    'Points',
    'Notes',
    'Justification',
    'ReviewStatus',
    'WeekStart',
    'ReportingMonth',
    'LoggedBy',
    'LoggedAt',
    'TargetUser',
    'TargetUserId',
    'KRIClassification',
    'ExecutiveInvolvementRequested',
    'ExecutiveMonthlyPointsAtLog',
    'FollowUpRequired',
    'FollowUpDate',
    'ScheduledDate',
  ];
  const query = filter ? `&$filter=${filter.replace(/ClientID|ClientId/g, clientField)}` : '';
  return `${listUrl(webUrl, GEMS_LISTS.interactions)}/items?$select=${fields.join(',')}&$orderby=LoggedAt desc&$top=500${query}`;
}

function shouldFallbackToNextClientField(error: unknown, clientField: string): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  const field = clientField.toLowerCase();
  const statusMatch = normalized.match(/\b(400|404)\b/);
  return Boolean(statusMatch)
    || normalized.includes(`property ${field} does not exist`)
    || normalized.includes(`property '${field}' does not exist`)
    || normalized.includes(`property "${field}" does not exist`)
    || normalized.includes(`field '${field}' does not exist`)
    || normalized.includes(`field ${field} does not exist`)
    || normalized.includes('does not exist on type');
}

async function getGemsInteractionsWithQuery(context: WebPartContext, filter?: string): Promise<GemsInteractionRecord[]> {
  const merged = new Map<string, GemsInteractionRecord>();

  for (const clientField of GEMS_CLIENT_FIELD_CANDIDATES) {
    try {
      const data = await getJson(context.pageContext.web.absoluteUrl, buildGemsInteractionsQuery(context.pageContext.web.absoluteUrl, clientField, filter));
      (data.value || []).map(normalizeGemsInteraction).forEach((item) => {
        const key = String(item.ID || `${item.ClientID}-${item.LoggedAt}-${item.Title}`);
        if (!merged.has(key)) merged.set(key, item);
      });
    } catch (error) {
      if (!shouldFallbackToNextClientField(error, clientField)) {
        throw error;
      }
    }
  }

  return Array.from(merged.values());
}

export async function getGemsInteractionsByClient(context: WebPartContext, clientId: string): Promise<GemsInteractionRecord[]> {
  const safeClientId = String(clientId || '').trim().replace(/'/g, "''");
  if (!safeClientId) return [];
  return getGemsInteractionsWithQuery(context, `ClientID eq '${safeClientId}'`);
}

export async function getGemsInteractionsByCompany(context: WebPartContext, companyKey: string): Promise<GemsInteractionRecord[]> {
  const safeKey = normalizeGemsLookupKey(companyKey).replace(/'/g, "''");
  if (!safeKey) return [];
  return getGemsInteractionsWithQuery(context, `CompanyKey eq '${safeKey}'`);
}

export async function logGemsInteraction(
  context: WebPartContext,
  data: {
    clientId: string;
    clientName?: string;
    companyKey?: string;
    companyName?: string;
    agency?: string;
    businessArm?: string;
    targetUser: string;
    targetUserId?: string;
    interactionType: string;
    category: string;
    finalClassification?: string;
    influencePercent?: number;
    notes: string;
    justification?: string;
    reviewStatus?: string;
    weekStart?: string;
    reportingMonth?: string;
    loggedBy?: string;
    kriClassification?: string;
    executiveInvolvementRequested?: boolean;
    executiveMonthlyPointsAtLog?: number;
    followUpRequired?: boolean;
    followUpDate?: string;
    scheduledDate?: string;
  }
): Promise<GemsInteractionRecord> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  await ensureGemsInteractionsReady(webUrl, digest);
  const points = GEMS_CATEGORY_POINTS[data.category] ?? 0;
  const basePayload = {
    Title: `${String(data.category || 'Ruby')} - ${String(data.clientName || data.clientId || 'contact')}`.trim(),
    ClientName: String(data.clientName || ''),
    CompanyKey: normalizeGemsLookupKey(data.companyKey || data.companyName || ''),
    CompanyName: String(data.companyName || ''),
    Agency: String(data.agency || ''),
    BusinessArm: String(data.businessArm || ''),
    InteractionType: String(data.interactionType || 'Meeting'),
    Category: String(data.category || 'Ruby'),
    FinalClassification: String(data.finalClassification || data.category || 'Ruby'),
    InfluencePercent: String(data.influencePercent || 0),
    Points: String(points),
    Notes: String(data.notes || ''),
    Justification: String(data.justification || data.notes || ''),
    ReviewStatus: String(data.reviewStatus || 'Submitted'),
    WeekStart: String(data.weekStart || ''),
    ReportingMonth: String(data.reportingMonth || ''),
    LoggedBy: String(data.loggedBy || context.pageContext.user.displayName || ''),
    LoggedAt: new Date().toISOString(),
    TargetUser: String(data.targetUser || ''),
    TargetUserId: String(data.targetUserId || ''),
    KRIClassification: String(data.kriClassification || ''),
    ExecutiveInvolvementRequested: Boolean(data.executiveInvolvementRequested),
    ExecutiveMonthlyPointsAtLog: String(data.executiveMonthlyPointsAtLog || 0),
    FollowUpRequired: Boolean(data.followUpRequired),
    FollowUpDate: String(data.followUpDate || ''),
    ScheduledDate: String(data.scheduledDate || ''),
  };

  let created: any = null;
  let lastError: unknown = null;
  for (const clientField of GEMS_CLIENT_FIELD_CANDIDATES) {
    try {
      created = await ensureListItem(webUrl, digest, GEMS_LISTS.interactions, {
        ...basePayload,
        [clientField]: String(data.clientId || ''),
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!shouldFallbackToNextClientField(error, clientField)) {
        throw error;
      }
    }
  }
  if (!created) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Failed to save GEMS interaction.'));
  }
  return {
    ID: String(created?.Id || created?.ID || ''),
    Title: basePayload.Title,
    ClientID: String(data.clientId || ''),
    ClientName: basePayload.ClientName,
    CompanyKey: basePayload.CompanyKey,
    CompanyName: basePayload.CompanyName,
    Agency: basePayload.Agency,
    BusinessArm: basePayload.BusinessArm,
    InteractionType: basePayload.InteractionType,
    Category: basePayload.Category,
    FinalClassification: basePayload.FinalClassification,
    InfluencePercent: Number(basePayload.InfluencePercent || 0),
    Points: points,
    Notes: basePayload.Notes,
    Justification: basePayload.Justification,
    ReviewStatus: basePayload.ReviewStatus,
    WeekStart: basePayload.WeekStart,
    ReportingMonth: basePayload.ReportingMonth,
    LoggedBy: basePayload.LoggedBy,
    LoggedAt: basePayload.LoggedAt,
    TargetUser: basePayload.TargetUser,
    TargetUserId: basePayload.TargetUserId,
    KRIClassification: basePayload.KRIClassification,
    ExecutiveInvolvementRequested: Boolean(basePayload.ExecutiveInvolvementRequested),
    ExecutiveMonthlyPointsAtLog: Number(basePayload.ExecutiveMonthlyPointsAtLog || 0),
    FollowUpRequired: Boolean(basePayload.FollowUpRequired),
    FollowUpDate: basePayload.FollowUpDate,
    ScheduledDate: basePayload.ScheduledDate,
  };
}

export async function getGemsInteractionsByEmployee(context: WebPartContext, employeeName: string): Promise<GemsInteractionRecord[]> {
  const safeName = String(employeeName || '').trim().replace(/'/g, "''");
  if (!safeName) return [];
  return getGemsInteractionsWithQuery(context, `LoggedBy eq '${safeName}'`);
}

export async function updateGemsInteractionClassification(
  context: WebPartContext,
  itemId: string | number,
  data: {
    finalClassification: string;
    reviewStatus: string;
    category?: string;
  }
): Promise<void> {
  const webUrl = context.pageContext.web.absoluteUrl;
  const digest = await getRequestDigest(webUrl);
  const safeId = String(itemId || '').trim();
  if (!safeId) return;

  const payload: Record<string, any> = {
    FinalClassification: String(data.finalClassification || ''),
    ReviewStatus: String(data.reviewStatus || 'Validated'),
  };
  if (data.category) {
    payload.Category = String(data.category);
    const points = GEMS_CATEGORY_POINTS[data.category] ?? 0;
    payload.Points = String(points);
  }

  await fetch(`${listUrl(webUrl, GEMS_LISTS.interactions)}/items(${safeId})`, {
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
}
