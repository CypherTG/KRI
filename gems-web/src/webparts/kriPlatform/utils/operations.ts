import { IAutomation, IComm, IClient, IEngagement } from '../services/graphApi';
import { GemsInteractionRecord } from '../services/gemsApi';
import { normalizeLookupKey, normalizeLookupText } from './lookupHelpers';

export type OperationalSource = 'communication' | 'interaction' | 'automation' | 'engagement' | 'document';

export interface OperationalItem {
  id: string;
  source: OperationalSource;
  title: string;
  subtitle: string;
  dueDate?: string;
  clientId?: string;
  clientName?: string;
  companyName?: string;
  priority: 'high' | 'medium' | 'low';
  statusLabel: string;
  route?: string;
  accent: string;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatShortDate(value?: string | null): string {
  const parsed = parseDate(value);
  if (!parsed) return '';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(value?: string | null): number | null {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const diff = parsed.getTime() - Date.now();
  return Math.round(diff / 86400000);
}

function activePriorityFromDays(days: number | null): 'high' | 'medium' | 'low' {
  if (days === null) return 'low';
  if (days < 0) return 'high';
  if (days <= 7) return 'medium';
  return 'low';
}

function dayStatus(days: number | null): string {
  if (days === null) return 'No due date';
  if (days < 0) return `Overdue by ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

function clientPath(clientId?: string, companyName?: string): string | undefined {
  if (clientId) return `/clients/${clientId}`;
  if (companyName) return `/companies/${encodeURIComponent(normalizeLookupKey(companyName))}`;
  return undefined;
}

function itemAccent(priority: 'high' | 'medium' | 'low'): string {
  if (priority === 'high') return '#F44336';
  if (priority === 'medium') return '#FF9800';
  return '#477BFF';
}

export function buildCommunicationOperationalItems(
  communications: IComm[],
  clients: IClient[],
  scope?: { clientId?: string; companyName?: string; userId?: string; userName?: string },
): OperationalItem[] {
  const byClient = new Map(clients.map((client) => [String(client.ID), client]));
  return communications
    .filter((comm) => Boolean(comm.FollowUpRequired || comm.FollowUpDate || comm.NextFollowUpDate))
    .filter((comm) => {
      if (scope?.clientId && String(comm.ClientID) !== String(scope.clientId)) return false;
      if (!scope?.companyName) return true;
      const client = byClient.get(String(comm.ClientID));
      if (!client) return false;
      return normalizeLookupKey(client.CompanyName) === normalizeLookupKey(scope.companyName);
    })
    .map((comm) => {
      const client = byClient.get(String(comm.ClientID));
      const dueDate = comm.FollowUpDate || comm.NextFollowUpDate || '';
      const days = daysUntil(dueDate);
      const priority: OperationalItem['priority'] = comm.FollowUpRequired ? activePriorityFromDays(days) : 'low';
      return {
        id: `comm-${comm.ID}`,
        source: 'communication' as const,
        title: comm.Subject || comm.CommunicationType || 'Communication follow-up',
        subtitle: [client ? `${client.FirstName || ''} ${client.LastName || ''}`.trim() || client.CompanyName : 'Stakeholder communication', comm.CommunicationType || '', comm.Notes || '']
          .filter(Boolean)
          .join(' - '),
        dueDate: formatShortDate(dueDate),
        clientId: String(comm.ClientID || ''),
        clientName: client ? `${client.FirstName || ''} ${client.LastName || ''}`.trim() : '',
        companyName: client?.CompanyName || '',
        priority,
        statusLabel: dayStatus(days),
        route: clientPath(String(comm.ClientID || ''), client?.CompanyName),
        accent: itemAccent(priority),
      };
    })
    .sort((left, right) => {
      const leftDays = daysUntil(left.dueDate);
      const rightDays = daysUntil(right.dueDate);
      if (leftDays === null && rightDays === null) return 0;
      if (leftDays === null) return 1;
      if (rightDays === null) return -1;
      return leftDays - rightDays;
    });
}

export function buildInteractionOperationalItems(
  interactions: GemsInteractionRecord[],
  clients: IClient[],
  scope?: { clientId?: string; companyName?: string; userId?: string; userName?: string },
): OperationalItem[] {
  const byClient = new Map(clients.map((client) => [String(client.ID), client]));
  const userTokens = [scope?.userId, scope?.userName].filter(Boolean).map((value) => normalizeLookupText(value).toLowerCase());
  return interactions
    .filter((item) => Boolean(item.FollowUpRequired || item.FollowUpDate))
    .filter((item) => {
      if (scope?.clientId && String(item.ClientID) !== String(scope.clientId)) return false;
      if (scope?.companyName) {
        const client = byClient.get(String(item.ClientID));
        if (!client) return false;
        if (normalizeLookupKey(client.CompanyName) !== normalizeLookupKey(scope.companyName)) return false;
      }
      if (userTokens.length > 0) {
        const haystack = [
          item.TargetUser,
          item.TargetUserId,
          item.LoggedBy,
        ].filter(Boolean).join(' ').toLowerCase();
        if (haystack && !userTokens.some((token) => haystack.includes(token))) {
          return false;
        }
      }
      return true;
    })
    .map((item) => {
      const client = byClient.get(String(item.ClientID));
      const days = daysUntil(item.FollowUpDate || '');
      const priority: OperationalItem['priority'] = item.FollowUpRequired ? activePriorityFromDays(days) : 'low';
      return {
        id: `interaction-${item.ID}`,
        source: 'interaction' as const,
        title: `${item.Category || 'GEMS'} interaction`,
        subtitle: [item.ClientName || client?.Title || 'Stakeholder', item.Agency || item.BusinessArm || '', item.Justification || item.Notes || '']
          .filter(Boolean)
          .join(' - '),
        dueDate: formatShortDate(item.FollowUpDate || ''),
        clientId: String(item.ClientID || ''),
        clientName: item.ClientName || client?.Title || '',
        companyName: item.CompanyName || client?.CompanyName || '',
        priority,
        statusLabel: dayStatus(days),
        route: clientPath(String(item.ClientID || ''), item.CompanyName || client?.CompanyName),
        accent: itemAccent(priority),
      };
    })
    .sort((left, right) => {
      const leftDays = daysUntil(left.dueDate);
      const rightDays = daysUntil(right.dueDate);
      if (leftDays === null && rightDays === null) return 0;
      if (leftDays === null) return 1;
      if (rightDays === null) return -1;
      return leftDays - rightDays;
    });
}

export function buildAutomationOperationalItems(automations: IAutomation[], clients: IClient[]): OperationalItem[] {
  const byClient = new Map(clients.map((client) => [String(client.ID), client]));
  return automations
    .filter((automation) => automation.IsEnabled !== false)
    .map((automation) => {
      const client = byClient.get(String(automation.ClientID || ''));
      const days = daysUntil(automation.TriggerDate || '');
      const priority: OperationalItem['priority'] = activePriorityFromDays(days);
      return {
        id: `automation-${automation.ID}`,
        source: 'automation' as const,
        title: automation.Title || automation.AutomationType || 'Automation',
        subtitle: [client ? `${client.FirstName || ''} ${client.LastName || ''}`.trim() || client.CompanyName : 'Global reminder', automation.AutomationType || '', automation.MessageTemplate || '']
          .filter(Boolean)
          .join(' - '),
        dueDate: formatShortDate(automation.TriggerDate || ''),
        clientId: String(automation.ClientID || ''),
        clientName: client ? `${client.FirstName || ''} ${client.LastName || ''}`.trim() : '',
        companyName: client?.CompanyName || automation.ClientName || '',
        priority,
        statusLabel: dayStatus(days),
        route: clientPath(String(automation.ClientID || ''), client?.CompanyName || automation.ClientName || ''),
        accent: itemAccent(priority),
      };
    })
    .sort((left, right) => {
      const leftDays = daysUntil(left.dueDate);
      const rightDays = daysUntil(right.dueDate);
      if (leftDays === null && rightDays === null) return 0;
      if (leftDays === null) return 1;
      if (rightDays === null) return -1;
      return leftDays - rightDays;
    });
}

export function summarizeOperationalItems(items: OperationalItem[]) {
  return {
    total: items.length,
    overdue: items.filter((item) => item.priority === 'high').length,
    dueSoon: items.filter((item) => item.priority === 'medium').length,
    upcoming: items.filter((item) => item.priority === 'low').length,
  };
}
