import { KriContext } from '../../../types/kri';
import {
  getAllComms,
  getAutomations,
  getClients,
  getCurrentSiteUser,
  getCurrentUserProfile,
  getEngagements,
  getStageHistory,
  IAutomation,
  IClient,
  IComm,
  IEngagement,
  IStageChange,
} from './graphApi';
import { getContactAccessRequestsForUser, KairosContactAccessRequest } from './sharepointProvisioning';
import { approvedClientIdsForRequestUser, canEditClient } from '../utils/kairosPermissions';

export interface KairosAccessContext {
  siteUser: any;
  isAdmin: boolean;
  accessRequests: KairosContactAccessRequest[];
  approvedClientIds: Set<string>;
}

export interface KairosDataset {
  clients: IClient[];
  engagements: IEngagement[];
  comms: IComm[];
  stageHistory: IStageChange[];
}

function clientIdSet(clients: Array<Pick<IClient, 'ID'>>): Set<string> {
  return new Set(clients.map((client) => String(client.ID || '')).filter(Boolean));
}

function filterByClientIds<T extends { ClientID?: string }>(items: T[], allowedClientIds: Set<string>): T[] {
  return items.filter((item) => allowedClientIds.has(String(item.ClientID || '')));
}

function normalizeIdentity(value: any): string {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim().toLowerCase();
  const candidates = [
    value.Id,
    value.ID,
    value.LookupId,
    value.LookupValue,
    value.Title,
    value.DisplayName,
    value.Name,
    value.Email,
    value.EMail,
    value.LoginName,
    value.email,
    value.loginName,
    value.displayName,
  ];
  const found = candidates.find((entry) => entry && String(entry).trim());
  return found ? String(found).trim().toLowerCase() : '';
}

function isEngagementOwnedByPrincipal(engagement: any, principal: any): boolean {
  if (!engagement || !principal) return false;
  const principalKey = normalizeIdentity(principal);
  if (!principalKey) return false;
  const ownerSources = [
    engagement.OwnedBy,
    engagement.OwnedById,
    engagement.OwnedByID,
    engagement.AssignedTo,
    engagement.AssignedToId,
    engagement.AssignedToID,
  ];
  const ownerTokens: string[] = [];
  ownerSources.forEach((entry) => {
    if (!entry) return;
    if (typeof entry === 'string' || typeof entry === 'number') {
      ownerTokens.push(normalizeIdentity(entry));
      return;
    }
    ownerTokens.push(
      normalizeIdentity(entry.Id),
      normalizeIdentity(entry.ID),
      normalizeIdentity(entry.LookupId),
      normalizeIdentity(entry.LookupValue),
      normalizeIdentity(entry.Title),
      normalizeIdentity(entry.DisplayName),
      normalizeIdentity(entry.Name),
      normalizeIdentity(entry.Email),
      normalizeIdentity(entry.EMail),
      normalizeIdentity(entry.LoginName),
      normalizeIdentity(entry.email),
      normalizeIdentity(entry.loginName),
      normalizeIdentity(entry.displayName),
    );
  });
  return ownerTokens.some((token) => token === principalKey);
}

export function canViewEngagement(engagement: any, principal: any, isAdmin: boolean): boolean {
  return Boolean(isAdmin || isEngagementOwnedByPrincipal(engagement, principal));
}

export async function getKairosAccessContext(context: KriContext): Promise<KairosAccessContext> {
  const currentUserKey = context.pageContext.user.email || context.pageContext.user.loginName || '';
  const [siteUser, profile, accessRequests] = await Promise.all([
    getCurrentSiteUser(context).catch(() => context.pageContext.user),
    getCurrentUserProfile(context, currentUserKey).catch(() => null),
    getContactAccessRequestsForUser(context).catch(() => [] as KairosContactAccessRequest[]),
  ]);
  const principal = siteUser || context.pageContext.user;
  const isAdmin = Boolean(context.session?.isAdmin);
  const approvedClientIds = approvedClientIdsForRequestUser(accessRequests, principal);
  return { siteUser: principal, isAdmin, accessRequests, approvedClientIds };
}

/**
 * Visibility.
 *
 * The server already filters every list response, so this function is a
 * client-side mirror used for badges and empty states. It returns what the
 * user is entitled to see: contacts they own, or contacts shared with them
 * through an approved access request — or everything, for an administrator.
 */
export function scopeVisibleClients(clients: IClient[], access: KairosAccessContext): IClient[] {
  if (access.isAdmin) return clients;
  return clients.filter(
    (client) => access.approvedClientIds.has(String(client.ID)) || isOwnedBy(client, access.siteUser),
  );
}

function isOwnedBy(client: IClient, principal: any): boolean {
  const keys = new Set(
    [
      principal?.Id,
      principal?.ID,
      principal?.Email,
      principal?.LoginName,
      principal?.Title,
      principal?.email,
      principal?.loginName,
      principal?.displayName,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase()),
  );
  if (!keys.size) return false;

  const ownerKeys = new Set<string>();
  const add = (value: any) => {
    if (!value) return;
    if (typeof value === 'string' || typeof value === 'number') {
      ownerKeys.add(String(value).trim().toLowerCase());
      return;
    }
    [value.Id, value.ID, value.LookupId, value.Title, value.DisplayName, value.Name, value.Email, value.EMail, value.LoginName, value.email, value.loginName, value.displayName]
      .filter(Boolean)
      .forEach((entry) => ownerKeys.add(String(entry).trim().toLowerCase()));
  };
  add(client.KCCContactPersonId);
  add(client.KRISecondaryContactId);
  add(client.KCCContactPerson);
  add(client.KRISecondaryContact);

  return Array.from(ownerKeys).some((key) => keys.has(key));
}

export function scopeEditableClients(clients: IClient[], access: KairosAccessContext): IClient[] {
  return clients.filter((client) => canEditClient(client, access.siteUser, access.isAdmin));
}

export async function getVisibleClients(context: KriContext): Promise<IClient[]> {
  const [clients, access] = await Promise.all([getClients(context), getKairosAccessContext(context)]);
  return scopeVisibleClients(clients, access);
}

export async function getEditableClients(context: KriContext): Promise<IClient[]> {
  const [clients, access] = await Promise.all([getClients(context), getKairosAccessContext(context)]);
  return scopeEditableClients(clients, access);
}

export async function getVisibleKriDataset(context: KriContext): Promise<KairosDataset> {
  const safe = async <T>(label: string, promise: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await promise;
    } catch (err) {
      console.warn(`[KRI] ${label} load failed`, err);
      return fallback;
    }
  };
  const [clients, engagements, comms, stageHistory] = await Promise.all([
    safe('clients', getClients(context), [] as IClient[]),
    safe('engagements', getEngagements(context), [] as IEngagement[]),
    safe('comms', getAllComms(context), [] as IComm[]),
    safe('stageHistory', getStageHistory(context), [] as IStageChange[]),
  ]);
  return { clients, engagements, comms, stageHistory };
}

export async function getEditableKriDataset(context: KriContext): Promise<KairosDataset> {
  const [clients, engagements, comms, stageHistory, access] = await Promise.all([
    getClients(context),
    getEngagements(context),
    getAllComms(context),
    getStageHistory(context),
    getKairosAccessContext(context),
  ]);
  const editableClients = scopeEditableClients(clients, access);
  const editableClientIds = clientIdSet(editableClients);
  return {
    clients: editableClients,
    engagements: filterByClientIds(engagements, editableClientIds),
    comms: filterByClientIds(comms, editableClientIds),
    stageHistory: filterByClientIds(stageHistory, editableClientIds),
  };
}

export async function getMyKriDataset(context: KriContext): Promise<KairosDataset> {
  const [clients, engagements, comms, stageHistory, access] = await Promise.all([
    getClients(context),
    getEngagements(context),
    getAllComms(context),
    getStageHistory(context),
    getKairosAccessContext(context),
  ]);
  return {
    clients: scopeVisibleClients(clients, access),
    engagements: filterByClientIds(engagements, clientIdSet(scopeVisibleClients(clients, access))),
    comms: filterByClientIds(comms, clientIdSet(scopeVisibleClients(clients, access))),
    stageHistory: filterByClientIds(stageHistory, clientIdSet(scopeVisibleClients(clients, access))),
  };
}

export async function getVisibleEngagements(context: KriContext): Promise<IEngagement[]> {
  const [engagements, access] = await Promise.all([
    getEngagements(context),
    getKairosAccessContext(context),
  ]);
  return engagements.filter((engagement) => canViewEngagement(engagement, access.siteUser, access.isAdmin));
}

export async function getEditableEngagements(context: KriContext): Promise<IEngagement[]> {
  return getVisibleEngagements(context);
}

export async function getEditableAutomations(context: KriContext): Promise<{ automations: IAutomation[]; clients: IClient[] }> {
  const [automations, clients, access] = await Promise.all([
    getAutomations(context),
    getClients(context),
    getKairosAccessContext(context),
  ]);
  const editableClients = scopeEditableClients(clients, access);
  const editableClientIds = clientIdSet(editableClients);
  return {
    automations: filterByClientIds(automations, editableClientIds),
    clients: editableClients,
  };
}
