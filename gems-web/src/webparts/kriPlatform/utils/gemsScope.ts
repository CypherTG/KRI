import { IClient } from '../services/graphApi';
import { normalizeLookupKey } from './lookupHelpers';

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
