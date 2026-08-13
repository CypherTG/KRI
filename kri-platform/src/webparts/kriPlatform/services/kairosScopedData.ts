import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  getAllComms,
  getAutomations,
  getClients,
  getCurrentSiteUser,
  getCurrentUserProfile,
  getEngagements,
  getStageHistory,
  isManagementAdminUser,
  IAutomation,
  IClient,
  IComm,
  IEngagement,
  IStageChange,
} from './graphApi';
import { getContactAccessRequestsForUser, KairosContactAccessRequest } from './sharepointProvisioning';
import { approvedClientIdsForRequestUser, canEditClient, canViewClient, isClientOwnedByPrincipal } from '../utils/kairosPermissions';

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

export async function getKairosAccessContext(context: WebPartContext): Promise<KairosAccessContext> {
  const currentUserKey = context.pageContext.user.email || context.pageContext.user.loginName || '';
  const [siteUser, profile, accessRequests] = await Promise.all([
    getCurrentSiteUser(context).catch(() => context.pageContext.user),
    getCurrentUserProfile(context, currentUserKey).catch(() => null),
    getContactAccessRequestsForUser(context).catch(() => [] as KairosContactAccessRequest[]),
  ]);
  const principal = siteUser || context.pageContext.user;
  const isAdmin = isManagementAdminUser(profile);
  const approvedClientIds = approvedClientIdsForRequestUser(accessRequests, principal);
  return { siteUser: principal, isAdmin, accessRequests, approvedClientIds };
}

export function scopeVisibleClients(clients: IClient[], access: KairosAccessContext): IClient[] {
  return clients;
}

export function scopeEditableClients(clients: IClient[], access: KairosAccessContext): IClient[] {
  return clients.filter((client) => canEditClient(client, access.siteUser, access.isAdmin));
}

export async function getVisibleClients(context: WebPartContext): Promise<IClient[]> {
  const [clients, access] = await Promise.all([getClients(context), getKairosAccessContext(context)]);
  return scopeVisibleClients(clients, access);
}

export async function getEditableClients(context: WebPartContext): Promise<IClient[]> {
  const [clients, access] = await Promise.all([getClients(context), getKairosAccessContext(context)]);
  return scopeEditableClients(clients, access);
}

export async function getVisibleKriDataset(context: WebPartContext): Promise<KairosDataset> {
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
  return {
    clients,
    engagements,
    comms,
    stageHistory,
  };
}

export async function getEditableKriDataset(context: WebPartContext): Promise<KairosDataset> {
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

export async function getMyKriDataset(context: WebPartContext): Promise<KairosDataset> {
  const [clients, engagements, comms, stageHistory, access] = await Promise.all([
    getClients(context),
    getEngagements(context),
    getAllComms(context),
    getStageHistory(context),
    getKairosAccessContext(context),
  ]);
  return {
    clients,
    engagements,
    comms,
    stageHistory,
  };
}

export async function getVisibleEngagements(context: WebPartContext): Promise<IEngagement[]> {
  const [engagements, access] = await Promise.all([
    getEngagements(context),
    getKairosAccessContext(context),
  ]);
  return engagements.filter((engagement) => canViewEngagement(engagement, access.siteUser, access.isAdmin));
}

export async function getEditableEngagements(context: WebPartContext): Promise<IEngagement[]> {
  const [engagements, access] = await Promise.all([
    getEngagements(context),
    getKairosAccessContext(context),
  ]);
  return engagements.filter((engagement) => canViewEngagement(engagement, access.siteUser, access.isAdmin));
}

export async function getEditableAutomations(context: WebPartContext): Promise<{ automations: IAutomation[]; clients: IClient[] }> {
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
