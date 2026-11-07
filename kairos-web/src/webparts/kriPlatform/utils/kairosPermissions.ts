import { IClient } from '../services/graphApi';
import { KairosContactAccessRequest } from '../services/sharepointProvisioning';

type Principal = {
  Id?: number | string;
  ID?: number | string;
  Title?: string;
  DisplayName?: string;
  Name?: string;
  Email?: string;
  EMail?: string;
  LoginName?: string;
  email?: string;
  loginName?: string;
  displayName?: string;
};

function normalize(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function principalTokens(value: any): string[] {
  if (!value) return [];
  if (typeof value === 'string' || typeof value === 'number') return [normalize(value)].filter(Boolean);
  const raw = [
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
  return raw.map(normalize).filter(Boolean);
}

export function getPrincipalKey(principal: Principal | null | undefined): string {
  if (!principal) return '';
  return normalize(principal.Email || principal.email || principal.LoginName || principal.loginName || principal.Id || principal.ID || principal.Title || principal.displayName);
}

export function getClientOwnerLabel(client: Partial<IClient>): string {
  const owner = client.KCCContactPerson as any;
  const tokens = [
    owner?.Title,
    owner?.LookupValue,
    owner?.DisplayName,
    owner?.Name,
    owner?.Email,
    owner?.LoginName,
  ];
  return String(tokens.find((entry) => entry && String(entry).trim()) || '').trim();
}

export function getClientCreatorLabel(client: Partial<IClient>): string {
  const author = client.Author as any;
  if (author) {
    const tokens = [
      author.Title,
      author.LookupValue,
      author.DisplayName,
      author.Name,
      author.Email,
      author.LoginName,
    ];
    const label = String(tokens.find((entry) => entry && String(entry).trim()) || '').trim();
    if (label) return label;
  }
  if (client.AuthorId) return `User #${client.AuthorId}`;
  return '';
}

export function isClientOwnedByPrincipal(client: Partial<IClient>, principal: Principal | null | undefined): boolean {
  if (!client || !principal) return false;
  const principalValues = new Set(principalTokens(principal));
  if (!principalValues.size) return false;

  const clientOwnerSources = [
    client.KCCContactPersonId,
    client.KRISecondaryContactId,
    client.AuthorId,
    client.KCCContactPerson,
    client.KRISecondaryContact,
    client.Author,
  ];
  const clientOwners = clientOwnerSources.reduce((all, source) => all.concat(principalTokens(source)), [] as string[]);

  return clientOwners.some((token) => principalValues.has(token));
}

export function approvedClientIdsForRequestUser(
  requests: KairosContactAccessRequest[],
  principal: Principal | null | undefined,
): Set<string> {
  const key = getPrincipalKey(principal);
  if (!key) return new Set();
  return new Set(
    requests
      .filter((request) => request.Status === 'Approved')
      .filter((request) => request.RequesterKey === key || normalize(request.RequesterEmail) === key)
      .map((request) => String(request.ClientID))
      .filter(Boolean),
  );
}

export function latestAccessRequestForClient(
  requests: KairosContactAccessRequest[],
  clientId: string,
): KairosContactAccessRequest | null {
  const matches = requests
    .filter((request) => String(request.ClientID) === String(clientId))
    .sort((left, right) => new Date(right.RequestedAt || 0).getTime() - new Date(left.RequestedAt || 0).getTime());
  return matches[0] || null;
}

/**
 * Read access.
 *
 * On SharePoint this returned `true` unconditionally, which meant every
 * signed-in user could open every contact in the registry — the access-request
 * workflow underneath it was built but never reached. The rule now matches
 * what the server enforces:
 *
 *   administrators see everything;
 *   everyone else sees contacts they own (primary or secondary relationship
 *   manager) plus contacts shared with them by an approved, unexpired request.
 *
 * Shared contacts are readable but NOT editable — see canEditClient.
 */
export function canViewClient(
  client: Partial<IClient>,
  principal: Principal | null | undefined,
  isAdmin: boolean,
  approvedClientIds: Set<string>,
): boolean {
  if (!client) return false;
  if (isAdmin) return true;
  if (isClientOwnedByPrincipal(client, principal)) return true;
  return approvedClientIds.has(String(client.ID));
}

/**
 * Write access. Ownership only — an approved access request grants read access
 * to a contact, matching the "Read-only shared access" treatment in the UI.
 */
export function canEditClient(
  client: Partial<IClient>,
  principal: Principal | null | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  return isClientOwnedByPrincipal(client, principal);
}
