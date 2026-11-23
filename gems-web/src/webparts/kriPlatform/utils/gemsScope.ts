import type { KriContext } from '../../../types/kri';
import { IClient, IKRIUser } from '../services/graphApi';
import { normalizeLookupKey, normalizeLookupText, userDisplayName } from './lookupHelpers';

export const GEMS_ALLOWED_AGENCIES = ['NUPRC', 'NUIMS', 'NCDMB', 'NEPL', 'NNPC', 'NIMASA', 'ENSERV', 'NMDPRA'];

export const GEMS_AGENCY_OPTIONS = [...GEMS_ALLOWED_AGENCIES];

/**
 * Maps known regulator names to their canonical code (`NEPL`, `NUIMS`, `ENSERV`, `NNPC`, etc.)
 * and preserves the company/organisation name for all other global stakeholders (e.g. `Aradel`).
 */
export function normalizeGemsAgency(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = normalizeLookupKey(raw).replace(/[^a-z0-9]+/g, '');
  if (!normalized) return raw;
  if (normalized.includes('nepl')) return 'NEPL';
  if (normalized.includes('nuims')) return 'NUIMS';
  if (normalized.includes('enserv')) return 'ENSERV';
  if (normalized.includes('nnpc')) return 'NNPC';
  const match = GEMS_ALLOWED_AGENCIES.find((agency) => normalized.includes(agency.toLowerCase()));
  return match || raw;
}

export function isGemsEligibleClient(client: Partial<IClient> | null | undefined): boolean {
  if (!client) return false;
  return client.IsActive !== false;
}

export function isGemsEligibleInteraction(_item: { CompanyName?: string; Agency?: string; Title?: string }): boolean {
  return true;
}

export function filterGemsEligibleClients<T extends Partial<IClient>>(clients: T[]): T[] {
  return (clients || []).filter((c) => isGemsEligibleClient(c));
}

export function agencyMatchesTarget(agency: string, targetAgency: string): boolean {
  const actual = normalizeGemsAgency(agency);
  if (!actual) return false;
  if (targetAgency === 'NEPL/NNPC') return actual === 'NEPL' || actual === 'NNPC';
  return actual.toUpperCase() === targetAgency.toUpperCase();
}

function normToken(value: unknown): string {
  return normalizeLookupText(value).toLowerCase();
}

function extractPersonTokens(person: any): { ids: string[]; labels: string[] } {
  if (!person) return { ids: [], labels: [] };
  if (typeof person === 'string' || typeof person === 'number') {
    const val = normToken(person);
    return { ids: val ? [val] : [], labels: val ? [val] : [] };
  }
  const ids = [person.Id, person.ID, person.LookupId, person.id]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  const labels = [
    person.Email,
    person.EMail,
    person.LoginName,
    person.Title,
    person.DisplayName,
    person.Name,
    person.LookupValue,
  ]
    .map(normToken)
    .filter(Boolean);
  return { ids, labels };
}

export function getCurrentUserIdentity(
  context: KriContext,
  profile?: Partial<IKRIUser> | null,
): { ids: Set<string>; tokens: Set<string> } {
  const ids = new Set<string>(
    [context?.session?.id, context?.pageContext?.user?.id, profile?.ID]
      .map((v) => String(v || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const rawTokens = [
    context?.session?.email,
    context?.session?.displayName,
    context?.pageContext?.user?.email,
    context?.pageContext?.user?.displayName,
    context?.pageContext?.user?.loginName,
    userDisplayName(profile as any),
    profile?.Email,
    profile?.UserAccount?.Email,
    profile?.UserAccount?.LoginName,
  ];
  const tokens = new Set<string>();
  rawTokens.forEach((raw) => {
    const t = normToken(raw);
    if (!t) return;
    tokens.add(t);
    if (t.includes('@')) {
      const local = t.split('@')[0]?.trim();
      if (local && local.length >= 3) tokens.add(local);
    }
  });
  return { ids, tokens };
}

function matchesIdentity(
  identity: { ids: Set<string>; tokens: Set<string> },
  idCandidates: unknown[],
  textCandidates: unknown[],
): boolean {
  for (const id of idCandidates) {
    const key = String(id || '').trim().toLowerCase();
    if (key && identity.ids.has(key)) return true;
  }
  for (const raw of textCandidates) {
    const label = normToken(raw);
    if (!label) continue;
    if (identity.tokens.has(label)) return true;
    for (const token of identity.tokens) {
      if (token.length >= 4 && (label.includes(token) || token.includes(label))) return true;
    }
  }
  return false;
}

/** True when a GEMS interaction was uploaded/logged by the signed-in user. */
export function isInteractionUploadedByCurrentUser(
  interaction: {
    LoggedById?: string;
    LoggedBy?: string;
    TargetUserId?: string;
    TargetUser?: string;
  },
  context: KriContext,
  profile?: Partial<IKRIUser> | null,
): boolean {
  const identity = getCurrentUserIdentity(context, profile);
  const hasLoggedField = Boolean(
    String(interaction.LoggedById || '').trim() || String(interaction.LoggedBy || '').trim(),
  );
  if (hasLoggedField) {
    return matchesIdentity(identity, [interaction.LoggedById], [interaction.LoggedBy]);
  }
  return matchesIdentity(identity, [interaction.TargetUserId], [interaction.TargetUser]);
}

/** True when an action/follow-up is on the signed-in user's tab (assigned to or created by them). */
export function isActionForCurrentUser(
  action: {
    AssignedToId?: string;
    AssignedTo?: string;
    CreatedById?: string;
    CreatedBy?: string;
  },
  context: KriContext,
  profile?: Partial<IKRIUser> | null,
): boolean {
  const identity = getCurrentUserIdentity(context, profile);
  return matchesIdentity(
    identity,
    [action.AssignedToId, action.CreatedById],
    [action.AssignedTo, action.CreatedBy],
  );
}

/** Collects Client IDs that the signed-in user updated via interactions or communications. */
export function getUserUpdatedClientIds(
  interactions: Array<{
    ClientID?: string;
    LoggedById?: string;
    LoggedBy?: string;
    TargetUserId?: string;
    TargetUser?: string;
  }>,
  comms: Array<{ ClientID?: string; LoggedBy?: any }>,
  context: KriContext,
  profile?: Partial<IKRIUser> | null,
): Set<string> {
  const identity = getCurrentUserIdentity(context, profile);
  const clientIds = new Set<string>();

  for (const interaction of interactions || []) {
    const cid = String(interaction.ClientID || '').trim();
    if (!cid) continue;
    if (
      matchesIdentity(
        identity,
        [interaction.LoggedById, interaction.TargetUserId],
        [interaction.LoggedBy, interaction.TargetUser],
      )
    ) {
      clientIds.add(cid);
    }
  }

  for (const comm of comms || []) {
    const cid = String(comm.ClientID || '').trim();
    if (!cid) continue;
    const { ids, labels } = extractPersonTokens(comm.LoggedBy);
    if (matchesIdentity(identity, ids, labels)) {
      clientIds.add(cid);
    }
  }

  return clientIds;
}

/** True when the signed-in user owns the contact or has updated/logged activity on it. */
export function isContactUpdatedByCurrentUser(
  client: Partial<IClient> | null | undefined,
  updatedClientIds: Set<string>,
  context: KriContext,
  profile?: Partial<IKRIUser> | null,
): boolean {
  if (!client) return false;
  if (client.ID && updatedClientIds.has(String(client.ID))) return true;
  const identity = getCurrentUserIdentity(context, profile);
  const primary = extractPersonTokens(client.KCCContactPerson);
  const secondary = extractPersonTokens(client.KRISecondaryContact);
  const author = extractPersonTokens(client.Author);
  return matchesIdentity(
    identity,
    [
      client.AuthorId,
      client.KCCContactPersonId,
      client.KRISecondaryContactId,
      ...primary.ids,
      ...secondary.ids,
      ...author.ids,
    ],
    [...primary.labels, ...secondary.labels, ...author.labels],
  );
}
