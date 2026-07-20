import { IClient } from '../services/graphApi';
import { normalizeLookupKey } from './lookupHelpers';

export const GEMS_ALLOWED_AGENCIES = ['NUPRC', 'NUIMS', 'NCDMB', 'NEPL', 'NNPC', 'NIMASA', 'ENSERV', 'NMDPRA'];

export const GEMS_AGENCY_OPTIONS = [...GEMS_ALLOWED_AGENCIES];

export function normalizeGemsAgency(value: string): string {
  const normalized = normalizeLookupKey(value).replace(/[^a-z0-9]+/g, '');
  if (!normalized) return '';
  if (normalized.includes('nepl')) return 'NEPL';
  if (normalized.includes('nnpc')) return 'NNPC';
  const match = GEMS_ALLOWED_AGENCIES.find((agency) => normalized.includes(agency.toLowerCase()));
  return match || '';
}

export function isGemsEligibleClient(client: Partial<IClient>): boolean {
  return Boolean(normalizeGemsAgency(client.CompanyName || client.Title || ''));
}

export function isGemsEligibleInteraction(item: { CompanyName?: string; Agency?: string; Title?: string }): boolean {
  return Boolean(normalizeGemsAgency(item.CompanyName || item.Agency || item.Title || ''));
}

export function filterGemsEligibleClients<T extends Partial<IClient>>(clients: T[]): T[] {
  return clients.filter(isGemsEligibleClient);
}

export function agencyMatchesTarget(agency: string, targetAgency: string): boolean {
  const actual = normalizeGemsAgency(agency);
  if (!actual) return false;
  if (targetAgency === 'NEPL/NNPC') return actual === 'NEPL' || actual === 'NNPC';
  return actual === targetAgency;
}
