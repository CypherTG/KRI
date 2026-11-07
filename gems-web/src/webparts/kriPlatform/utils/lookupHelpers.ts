import { IClient, IKRIUser } from '../services/graphApi';

export function normalizeLookupText(value: any): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function normalizeLookupKey(value: any): string {
  return normalizeLookupText(value).toLowerCase();
}

export function dedupeSortedLookupValues(values: any[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const text = normalizeLookupText(value);
    if (!text) return;
    const key = normalizeLookupKey(text);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function userDisplayName(user: Partial<IKRIUser> | any): string {
  return normalizeLookupText(
    user?.Title
    || user?.UserAccount?.Title
    || user?.UserAccount?.DisplayName
    || user?.UserAccount?.displayName
    || user?.UserAccount?.Email
    || user?.UserAccount?.email
    || user?.UserAccount?.LoginName
    || user?.UserAccount?.loginName
    || '',
  );
}

export function sortUsersByDisplayName(users: IKRIUser[]): IKRIUser[] {
  return [...users].sort((a, b) => {
    const left = userDisplayName(a).toLowerCase();
    const right = userDisplayName(b).toLowerCase();
    return left.localeCompare(right, undefined, { sensitivity: 'base' });
  });
}

export interface CompanySummary {
  key: string;
  name: string;
  clients: IClient[];
  totalContacts: number;
  knowledge: number;
  rapport: number;
  intimacy: number;
}

export function buildCompanySummaries(clients: IClient[]): CompanySummary[] {
  const groups = new Map<string, { name: string; clients: IClient[] }>();
  clients.forEach((client) => {
    const name = normalizeLookupText(client.CompanyName) || 'Unassigned';
    const key = normalizeLookupKey(name) || 'unassigned';
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { name, clients: [client] });
    } else {
      existing.clients.push(client);
      if (name.localeCompare(existing.name, undefined, { sensitivity: 'base' }) < 0) {
        existing.name = name;
      }
    }
  });

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const knowledge = group.clients.filter((client) => client.KRIStage === 'Knowledge').length;
      const rapport = group.clients.filter((client) => client.KRIStage === 'Rapport').length;
      const intimacy = group.clients.filter((client) => client.KRIStage === 'Intimacy').length;
      return {
        key,
        name: group.name,
        clients: group.clients.sort((a, b) => {
          const left = `${a.FirstName || ''} ${a.LastName || ''}`.trim().toLowerCase();
          const right = `${b.FirstName || ''} ${b.LastName || ''}`.trim().toLowerCase();
          return left.localeCompare(right, undefined, { sensitivity: 'base' });
        }),
        totalContacts: group.clients.length,
        knowledge,
        rapport,
        intimacy,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

