import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  getClients,
  getClient,
  getComms,
  getAllComms,
  getEngagements,
  getKRIUsers,
  getStageHistory,
  IClient,
  IComm,
  IEngagement,
  IKRIUser,
  IStageChange,
} from './graphApi';
import {
  GemsInteractionRecord,
  getGemsInteractions,
  getGemsInteractionsByClient,
  getGemsInteractionsByCompany,
  CompanyAcumenRecord,
  getCompanyAcumenRecords,
  getCompanyLookupOptions,
  getJobTitleLookupOptions,
} from './sharepointProvisioning';
import {
  GEMS_AGENCY_OPTIONS,
  filterGemsEligibleClients,
  normalizeGemsAgency,
  isGemsEligibleClient,
} from '../utils/gemsScope';
import { buildCompanySummaries, normalizeLookupKey } from '../utils/lookupHelpers';

export interface GemsDashboardData {
  stakeholders: IClient[];
  agencies: Array<{ key: string; name: string; totalContacts: number; knowledge: number; rapport: number; intimacy: number; clients: IClient[] }>;
  interactions: GemsInteractionRecord[];
  users: IKRIUser[];
  stats: {
    totalStakeholders: number;
    totalAgencies: number;
    totalInteractions: number;
    totalPoints: number;
    monthPoints: number;
    monthlyTarget: number;
    hundredPointUsers: number;
  };
}

export async function loadGemsDashboard(context: WebPartContext): Promise<GemsDashboardData> {
  const [allClients, allInteractions, allUsers] = await Promise.all([
    getClients(context),
    getGemsInteractions(context),
    getKRIUsers(context),
  ]);

  const stakeholders = filterGemsEligibleClients(allClients);
  const agencies = buildCompanySummaries(stakeholders);
  const interactions = allInteractions;
  const users = allUsers;

  const totalPoints = interactions.reduce((sum, i) => sum + Number(i.Points || 0), 0);
  const now = new Date();
  const monthInteractions = interactions.filter((i) => {
    const d = new Date(i.LoggedAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthPoints = monthInteractions.reduce((sum, i) => sum + Number(i.Points || 0), 0);
  const hundredPointUsers = users.filter((u) => {
    const userInteractions = interactions.filter((i) => String(i.TargetUserId) === String(u.ID));
    return userInteractions.reduce((sum, i) => sum + Number(i.Points || 0), 0) >= 100;
  }).length;

  return {
    stakeholders,
    agencies: agencies.map((a) => ({
      ...a,
      key: a.key,
      name: a.name,
      totalContacts: a.totalContacts,
      knowledge: a.knowledge,
      rapport: a.rapport,
      intimacy: a.intimacy,
      clients: a.clients,
    })),
    interactions,
    users,
    stats: {
      totalStakeholders: stakeholders.length,
      totalAgencies: agencies.length,
      totalInteractions: interactions.length,
      totalPoints,
      monthPoints,
      monthlyTarget: 100,
      hundredPointUsers,
    },
  };
}

export async function loadGemsStakeholderDetail(
  context: WebPartContext,
  stakeholderId: string,
): Promise<{
  client: IClient | null;
  interactions: GemsInteractionRecord[];
  comms: IComm[];
  engagements: IEngagement[];
  stageHistory: IStageChange[];
  biodata: any | null;
}> {
  const client = isGemsEligibleClient(await getClient(context, stakeholderId)) ? await getClient(context, stakeholderId) : null;
  if (!client) return { client: null, interactions: [], comms: [], engagements: [], stageHistory: [], biodata: null };

  const [interactions, comms, engagements, stageHistory, biodata] = await Promise.all([
    getGemsInteractionsByClient(context, stakeholderId),
    getComms(context, stakeholderId),
    getEngagements(context, stakeholderId),
    getStageHistory(context, stakeholderId),
    import('./sharepointProvisioning').then((m) => m.getClientBiodataRecord(context, stakeholderId).catch((): null => null)),
  ]);

  return { client, interactions, comms, engagements, stageHistory, biodata };
}

export async function loadGemsAgencyDetail(
  context: WebPartContext,
  agencyKey: string,
): Promise<{
  stakeholders: IClient[];
  agency: { key: string; name: string; totalContacts: number; knowledge: number; rapport: number; intimacy: number; clients: IClient[] } | null;
  interactions: GemsInteractionRecord[];
  acumen: CompanyAcumenRecord[];
}> {
  const normalizedKey = normalizeLookupKey(agencyKey);
  const allClients = filterGemsEligibleClients(await getClients(context));
  const summaries = buildCompanySummaries(allClients);
  const agency = summaries.find((s) => s.key === normalizedKey) || null;
  const stakeholders = agency ? agency.clients : [];

  const [interactions, acumen] = await Promise.all([
    getGemsInteractionsByCompany(context, normalizedKey),
    getCompanyAcumenRecords(context, normalizedKey),
  ]);

  return { stakeholders, agency, interactions, acumen };
}

export { GEMS_AGENCY_OPTIONS, normalizeGemsAgency, filterGemsEligibleClients, isGemsEligibleClient };
export { normalizeLookupKey } from '../utils/lookupHelpers';
export { buildCompanySummaries } from '../utils/lookupHelpers';
