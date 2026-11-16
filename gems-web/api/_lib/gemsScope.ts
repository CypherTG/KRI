/**
 * GEMS Global Scope & Regulator Normalisation.
 *
 * GEMS (Global Engagement Measurement System) operates globally across the entire
 * shared `clients` contact registry from KAIROS. Every contact submitted in KAIROS
 * immediately reflects in GEMS.
 *
 * When a contact's company matches one of the eight priority government regulators
 * (`NUPRC`, `NUIMS`, `NCDMB`, `NEPL`, `NNPC`, `NIMASA`, `ENSERV`, `NMDPRA`),
 * `normalizeGemsAgency` maps it to the canonical regulator code for Executive
 * Dashboard target tracking; for all other organisations (e.g. `Aradel`, IOCs,
 * commercial partners), it preserves the organisation name.
 */
export const GEMS_ALLOWED_AGENCIES = [
  'NUPRC',
  'NUIMS',
  'NCDMB',
  'NEPL',
  'NNPC',
  'NIMASA',
  'ENSERV',
  'NMDPRA',
] as const;

export type GemsAgency = (typeof GEMS_ALLOWED_AGENCIES)[number] | string;

/**
 * Resolves free text to a canonical regulator code when it matches one of the 8
 * priority agencies, or returns the trimmed organisation name globally.
 */
export function normalizeGemsAgency(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!key) return raw;
  if (key.includes('nepl')) return 'NEPL';
  if (key.includes('nuims')) return 'NUIMS';
  if (key.includes('enserv')) return 'ENSERV';
  if (key.includes('nnpc')) return 'NNPC';
  const match = GEMS_ALLOWED_AGENCIES.find((agency) => key.includes(agency.toLowerCase()));
  return match || raw;
}

export function isGemsEligible(_value: string | null | undefined): boolean {
  return true;
}

/** Human-readable list of priority regulators. */
export function gemsAgencyList(): string {
  return GEMS_ALLOWED_AGENCIES.join(', ');
}

/**
 * SQL predicate for GEMS stakeholder queries — includes all active contacts globally.
 */
export function gemsScopeSql(alias: string, _params: any[]): string {
  return `coalesce(${alias}.is_active, true) = true`;
}

/**
 * Resolves the agency/organisation label for an interaction record.
 */
export function resolveAgencyOrThrow(value: string | null | undefined): string {
  return normalizeGemsAgency(value) || 'General';
}
