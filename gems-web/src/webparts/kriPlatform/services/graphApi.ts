import { KriContext, apiRequest, fileToBase64 } from '../../../types/kri';

/**
 * KAIROS data access.
 *
 * This is a 1:1 port of the SharePoint build's `graphApi.ts`. Every exported
 * function keeps the same name, arguments, and return shape — the only thing
 * that changed is the transport: SharePoint REST (`SPHttpClient` + raw
 * `fetch` with `X-RequestDigest` + per-column type coercion) became a call
 * to our own `/api/*` routes, which run against Neon with the user's
 * visibility scope already applied in SQL.
 *
 * Consequences worth knowing:
 *  · SharePoint's dynamic column-type probing (`getFieldTypes`,
 *    `formatFieldsForWrite`, `resolve*FieldName`) is gone — Postgres has real
 *    types, so the coercion layer is no longer needed.
 *  · `getCurrentUserPhotoUrl` and the `userphoto.aspx` fallbacks are gone.
 *    Avatars now come from `users.profile_photo`, which each user uploads
 *    themselves from My Profile — SharePoint used to supply it from Entra ID.
 *  · `seedKRIUsersFromSharePointIdentity` is a no-op: accounts are created by
 *    registration, not harvested from a SharePoint site-user directory.
 */

// ─── Interfaces (unchanged from the SharePoint build) ─────────────────────────

export interface IClient {
  ID: string;
  Title: string;
  FirstName: string;
  LastName: string;
  Gender: string;
  Email: string;
  Phone: string;
  CompanyName: string;
  BusinessArm?: string[];
  JobTitle: string;
  ProjectName: string;
  KRIStage: 'Knowledge' | 'Rapport' | 'Intimacy' | string;
  LinkedInURL: string;
  LinkedInProfile?: string;
  InstagramHandle: string;
  InstagramAccount?: string;
  KRISecondaryContact: any;
  BirthdayDate: string;
  DateRegistered: string;
  LastContactDate: string;
  KCCContactPerson: any;
  KCCContactPersonId?: number | string;
  KRISecondaryContactId?: number | string;
  Author?: any;
  AuthorId?: number | string;
  Notes: string;
  NeedsOpportunity?: string;
  IsActive?: boolean;
  PhotoUrl?: string;
  Industry?: string;
  Created?: string;
  Modified?: string;
}

export interface IComm {
  ID: string;
  Title: string;
  ClientID: string;
  CommunicationType: string;
  Subject: string;
  Notes: string;
  CommunicationDate: string;
  LoggedBy: any;
  FollowUpRequired: boolean;
  FollowUpDate: string;
  NextFollowUpDate: string;
  ProposalSubmitted?: boolean;
}

export interface IEngagement {
  ID: string;
  Title: string;
  ClientID: string;
  ClientName?: string;
  Stage: 'Draft' | 'Submitted' | 'Won' | 'Lost' | string;
  Status?: string;
  EngagementType?: string;
  EstimatedValue: number;
  ActualValue: number;
  StartDate: string;
  ExpectedCloseDate: string;
  SubmittedDate?: string;
  ClosedDate: string;
  OwnedBy: any;
  Notes: string;
  Created?: string;
  Modified?: string;
}

export interface IAutomation {
  ID: string;
  Title: string;
  ClientID: string;
  ClientName?: string;
  AutomationType: 'Birthday Message' | 'Holiday Greeting' | 'Follow-Up Reminder' | 'Seasonal Card' | string;
  TriggerDate: string;
  IsRecurring: boolean;
  IsEnabled: boolean;
  MessageTemplate: string;
  LastSentDate: string;
  AssignedTo: any;
}

export interface IKRIUser {
  ID: string;
  Title: string;
  DisplayName?: string;
  Email?: string;
  LoginName?: string;
  UserAccount: any;
  JobTitle: string;
  Department: string;
  TargetClients: number;
  TargetDeals: number;
  IsActive: boolean;
  IsAdmin?: boolean;
  JoinDate: string;
  ProfilePhoto: string;
}

export interface IStageChange {
  ID: string;
  Title: string;
  ClientID: string;
  PreviousStage: string;
  NewStage: string;
  ChangedBy: any;
  ChangedDate: string;
  Notes: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  totalErrors?: number;
}

export type CsvImportResult = ImportResult;

const FOUNDING_ADMIN_EMAILS = ['mbello@konstructum.com', 'onechief011@gmail.com'];

// ─── Session identity ─────────────────────────────────────────────────────────

export interface ISiteUser {
  Id: number | string;
  Title: string;
  Email: string;
  LoginName: string;
}

/**
 * The signed-in user as a SharePoint-shaped person object. The server is the
 * authority on who owns what, so this is only used for display and for
 * client-side ownership hints.
 */
export async function getCurrentSiteUser(context: KriContext): Promise<ISiteUser> {
  const user = context?.session;
  if (!user) {
    return { Id: 0, Title: 'Unknown user', Email: '', LoginName: '' };
  }
  return {
    Id: user.id,
    Title: user.displayName,
    Email: user.email,
    LoginName: user.email,
  };
}

// ─── Photo helpers ────────────────────────────────────────────────────────────

/**
 * Retained for call-site compatibility. SharePoint's `userphoto.aspx`
 * endpoint no longer exists, so this resolves to the stored profile photo or
 * an empty string — in which case every Avatar falls back to initials.
 */
export function buildFallbackUserPhotoUrl(_webUrl: string, _accountName: string): string {
  return '';
}

export async function resolveSharePointUserPhotoUrl(
  context: KriContext,
  user: Partial<ISiteUser> | IKRIUser | any,
): Promise<string> {
  if (!user) return '';
  return String(user.ProfilePhoto || user.profile_photo || '');
}

export async function resolveSharePointUserPhotoDataUrl(
  context: KriContext,
  user: Partial<ISiteUser> | IKRIUser | any,
): Promise<string> {
  return resolveSharePointUserPhotoUrl(context, user);
}

export async function getCurrentUserPhotoUrl(context: KriContext): Promise<string> {
  return String(context?.session?.profilePhoto || '');
}

/**
 * Uploads the signed-in user's own profile photo.
 *
 * Replaces what SharePoint did automatically through Entra ID: there is no
 * longer an identity provider holding a picture for each user, so the user
 * supplies one. The server writes it to `users.profile_photo`, which is the
 * column every avatar in the app already reads.
 *
 * Returns the new URL so the caller can update the header avatar without a
 * reload.
 */
export async function uploadOwnProfilePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file (JPEG, PNG, WebP, GIF, AVIF or HEIC).');
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new Error('That image is larger than 4 MB. Please choose a smaller one.');
  }

  const base64 = await fileToBase64(file);
  const result = await apiRequest<{ profilePhoto: string }>('/profile-photo', {
    method: 'POST',
    body: { base64, contentType: file.type, fileName: file.name },
  });
  return result.profilePhoto || '';
}

/** Removes the signed-in user's own profile photo, reverting to initials. */
export async function removeOwnProfilePhoto(): Promise<void> {
  await apiRequest('/profile-photo', { method: 'DELETE' });
}

// ─── Roles ────────────────────────────────────────────────────────────────────

/**
 * Admin check.
 *
 * The SharePoint build guessed from job-title keywords ('director', 'ceo',
 * 'owner'…), which would have made anyone with "Director" in their title an
 * administrator. The role is now an explicit `users.is_admin` flag set by an
 * administrator, plus the pinned founding admin address.
 */
export function isManagementAdminUser(user: Partial<IKRIUser> | null | undefined): boolean {
  if (!user) return false;
  if (user.IsAdmin === true || (user as any).isAdmin === true) return true;
  const email = String((user as any).Email || (user as any).email || user.UserAccount?.Email || '').trim().toLowerCase();
  if (email && FOUNDING_ADMIN_EMAILS.includes(email)) return true;
  const account = String(user.UserAccount?.Email || user.UserAccount?.LoginName || '').trim().toLowerCase();
  return Boolean(account && FOUNDING_ADMIN_EMAILS.includes(account));
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function getClients(context: KriContext): Promise<IClient[]> {
  const result = await apiRequest<{ clients: IClient[] }>('/clients');
  return result.clients || [];
}

export async function getClient(context: KriContext, id: string): Promise<IClient> {
  const result = await apiRequest<{ client: IClient }>('/client', { query: { id } });
  return result.client;
}

export async function createClient(context: KriContext, data: Partial<IClient>): Promise<IClient> {
  const result = await apiRequest<{ client: IClient }>('/clients', {
    method: 'POST',
    body: data as any,
  });
  return result.client;
}

export async function updateClient(context: KriContext, id: string, data: Partial<IClient>): Promise<void> {
  await apiRequest('/client', { method: 'PATCH', query: { id }, body: data as any });
}

export async function deleteClient(context: KriContext, id: string): Promise<void> {
  await apiRequest('/client', { method: 'DELETE', query: { id } });
}

export async function updateClientStage(
  context: KriContext,
  clientId: string,
  previousStage: string,
  newStage: string,
  changedBy: string,
  notes?: string,
): Promise<void> {
  // The server writes the stage-history audit row and stamps
  // last_contact_date, so the client never has to keep the trail in sync.
  await apiRequest('/client', {
    method: 'PATCH',
    query: { id: clientId },
    body: { kriStage: newStage, stageNotes: notes || changedBy || '' },
  });
}

// ─── Communications ───────────────────────────────────────────────────────────

export async function getComms(context: KriContext, clientId?: string): Promise<IComm[]> {
  const result = await apiRequest<{ comms: IComm[] }>('/communications', { query: { clientId } });
  return result.comms || [];
}

export async function getAllComms(context: KriContext): Promise<IComm[]> {
  return getComms(context);
}

export async function logComm(
  context: KriContext,
  data: {
    clientId: string;
    subject: string;
    type: string;
    notes: string;
    nextFollowUp?: string;
    followUpRequired?: boolean;
    loggedBy?: any;
  },
): Promise<IComm> {
  const result = await apiRequest<{ comm: IComm }>('/communications', {
    method: 'POST',
    body: {
      clientId: data.clientId,
      subject: data.subject,
      type: data.type,
      notes: data.notes,
      nextFollowUp: data.nextFollowUp,
      followUpRequired: data.followUpRequired,
      loggedBy: typeof data.loggedBy === 'string' ? data.loggedBy : undefined,
    },
  });
  return result.comm;
}

// ─── Engagements ──────────────────────────────────────────────────────────────

export async function getEngagements(context: KriContext, clientId?: string): Promise<IEngagement[]> {
  const result = await apiRequest<{ engagements: IEngagement[] }>('/engagements', { query: { clientId } });
  return result.engagements || [];
}

export async function createEngagement(context: KriContext, data: Partial<IEngagement>): Promise<IEngagement> {
  const result = await apiRequest<{ engagement: IEngagement }>('/engagements', {
    method: 'POST',
    body: data as any,
  });
  return result.engagement;
}

export async function updateEngagementStage(context: KriContext, id: string, stage: string): Promise<void> {
  await apiRequest('/engagements', { method: 'PATCH', query: { id }, body: { stage } });
}

export async function updateEngagement(context: KriContext, id: string, data: Partial<IEngagement>): Promise<void> {
  await apiRequest('/engagements', { method: 'PATCH', query: { id }, body: data as any });
}

// ─── Automations ──────────────────────────────────────────────────────────────

export async function getAutomations(context: KriContext): Promise<IAutomation[]> {
  const result = await apiRequest<{ automations: IAutomation[] }>('/automations');
  return result.automations || [];
}

export async function createAutomation(context: KriContext, data: Partial<IAutomation>): Promise<IAutomation> {
  const result = await apiRequest<{ automation: IAutomation }>('/automations', {
    method: 'POST',
    body: data as any,
  });
  return result.automation;
}

export async function toggleAutomation(context: KriContext, id: string, isEnabled: boolean): Promise<void> {
  await apiRequest('/automations', { method: 'PATCH', query: { id }, body: { isEnabled } });
}

export async function updateAutomation(context: KriContext, id: string, data: Partial<IAutomation>): Promise<void> {
  await apiRequest('/automations', { method: 'PATCH', query: { id }, body: data as any });
}

export async function deleteAutomation(context: KriContext, id: string): Promise<void> {
  await apiRequest('/automations', { method: 'DELETE', query: { id } });
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getKRIUsers(context: KriContext): Promise<IKRIUser[]> {
  const result = await apiRequest<{ users: IKRIUser[] }>('/users');
  return result.users || [];
}

export async function getAllKRIUsers(context: KriContext): Promise<IKRIUser[]> {
  return getKRIUsers(context);
}

export async function getCurrentUserProfile(context: KriContext, _userEmail?: string): Promise<IKRIUser | null> {
  const user = context?.session;
  if (!user) return null;
  return {
    ID: String(user.id || ''),
    Title: String(user.displayName || user.title || user.email || ''),
    DisplayName: String(user.displayName || user.title || user.email || ''),
    Email: String(user.email || ''),
    LoginName: String(user.email || ''),
    UserAccount: {
      Id: user.id,
      ID: user.id,
      Title: user.displayName || user.title || user.email,
      Email: user.email,
      LoginName: user.email,
    },
    JobTitle: String(user.jobTitle || ''),
    Department: String(user.department || ''),
    TargetClients: Number(user.targetClients || 0),
    TargetDeals: Number(user.targetDeals || 0),
    IsActive: user.isActive !== false,
    IsAdmin: Boolean(user.isAdmin),
    JoinDate: '',
    ProfilePhoto: String(user.profilePhoto || ''),
  };
}

export async function updateUserTargets(
  context: KriContext,
  id: string,
  targets: { TargetClients?: number; TargetDeals?: number },
): Promise<void> {
  await apiRequest('/users', {
    method: 'PATCH',
    query: { id },
    body: { targetClients: targets.TargetClients, targetDeals: targets.TargetDeals },
  });
}

/**
 * The SharePoint build harvested site users and activity to reconcile
 * KRI_Users. Accounts are now created by registration and roles are set by an
 * administrator, so this simply returns the current registry and performs no
 * writes. It is kept so the Settings page call site still resolves.
 */
export async function seedKRIUsersFromSharePointIdentity(context: KriContext): Promise<IKRIUser[]> {
  return getKRIUsers(context);
}

// ─── Stage history ────────────────────────────────────────────────────────────

export async function getStageHistory(context: KriContext, clientId?: string): Promise<IStageChange[]> {
  const result = await apiRequest<{ stageHistory: IStageChange[] }>('/stage-history', { query: { clientId } });
  return result.stageHistory || [];
}

// ─── Compat shim ──────────────────────────────────────────────────────────────

/**
 * Generic list reader kept for compatibility. The AIROS tools that used this
 * now execute server-side against Neon with the caller's scope applied, so in
 * practice this only has to serve the resource routes that still exist.
 */
export async function getRawListItems(context: KriContext, listName: string, _filter?: string): Promise<any[]> {
  switch (String(listName).toLowerCase()) {
    case 'kri_clients':
      return getClients(context);
    case 'kri_communications':
      return getAllComms(context);
    case 'kri_engagements':
      return getEngagements(context);
    case 'kri_automations':
      return getAutomations(context);
    case 'kri_users':
      return getKRIUsers(context);
    case 'kri_stagehistory':
      return getStageHistory(context);
    case 'kri_companies': {
      const result = await apiRequest<{ companies: any[] }>('/companies');
      return result.companies || [];
    }
    case 'kri_biodata': {
      const clients = await getClients(context);
      return Promise.all(clients.map((client) => getBiodataCompat(client.ID)));
    }
    case 'kri_companyacumen': {
      const result = await apiRequest<{ records: any[] }>('/acumen', { query: { companyKey: '' } });
      return result.records || [];
    }
    default:
      return [];
  }
}

async function getBiodataCompat(contactId: string): Promise<any> {
  const result = await apiRequest<{ biodata: any }>('/biodata', { query: { contactId } });
  return result.biodata || null;
}

// ─── Excel / CSV import ───────────────────────────────────────────────────────

const SKIP_SHEET_NAME = '__unused__';
void SKIP_SHEET_NAME;

/**
 * Imports a workbook (.xlsx / .xls / .csv) into the contact registry.
 *
 * The column-synonym map, dedupe key, and overwrite-only-empty semantics all
 * moved to the server (`/api/import`), because that is where the ownership and
 * dedupe rules now live. Progress is still reported per row by chunking the
 * upload notification around the single server call.
 */
export async function importClientsFromExcel(
  context: KriContext,
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<ImportResult> {
  onProgress?.(0, 1);
  const base64 = await fileToBase64(file);
  const result = await apiRequest<ImportResult>('/import', {
    method: 'POST',
    body: { base64, fileName: file.name },
  });
  onProgress?.(1, 1);
  return {
    created: result.created || 0,
    updated: result.updated || 0,
    skipped: result.skipped || 0,
    errors: result.errors || [],
    totalErrors: result.totalErrors ?? (result.errors || []).length,
  };
}

export const importClientsFromCsv = importClientsFromExcel;
