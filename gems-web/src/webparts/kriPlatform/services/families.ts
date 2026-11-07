/**
 * The Konstructum group families.
 *
 * Single source of truth. This list previously lived inline in the dashboard in
 * three separate places — the chip row, the colour switch and the filter
 * predicate — so adding a family meant editing all three and missing one showed
 * up as a filter chip that silently returned nothing.
 *
 * The family of a person is derived from their email domain rather than from the
 * `department` column. Domains are authoritative: registration already refuses
 * any address outside the approved set, so every account maps to a family
 * without anyone having to fill in a form. `department` is still consulted as a
 * fallback for the founding administrator, whose address is deliberately
 * personal, and for any account created before the domain rule existed.
 *
 * If you add a family here, add its domain to ALLOWED_EMAIL_DOMAINS in
 * api/_lib/auth.ts as well, or nobody will be able to register on it.
 */
import { ALLOWED_EMAIL_DOMAINS } from './allowedDomains';

export const FAMILY_ALL = 'All Families';

export const FAMILIES = [
  'Konstructum',
  'PMT7 Integrated',
  'Interkonstruct',
  'NGneered Projects',
] as const;

export type Family = (typeof FAMILIES)[number];

/** Not a family — the bucket for anyone who matches none of them. */
export const FAMILY_OTHER = 'Other';

export type FamilyFilter = Family | typeof FAMILY_ALL | typeof FAMILY_OTHER;

export const FAMILY_COLORS: Record<string, string> = {
  Konstructum: '#477BFF',
  'PMT7 Integrated': '#00BFA5',
  Interkonstruct: '#FF7043',
  'NGneered Projects': '#AB47BC',
  [FAMILY_ALL]: '#477BFF',
  [FAMILY_OTHER]: '#7B8FA6',
};

export function familyColor(family: string): string {
  return FAMILY_COLORS[family] || '#7B8FA6';
}

/** Maps each approved email domain onto its family label. */
const DOMAIN_TO_FAMILY: Record<string, Family> = {
  'konstructum.com': 'Konstructum',
  'pmt7integrated.com': 'PMT7 Integrated',
  'interkonstruct.com': 'Interkonstruct',
  'ngneeredprojects.com': 'NGneered Projects',
};

/** Aliases seen in free text, so a department typed by a human still resolves. */
const TEXT_PATTERNS: Array<[RegExp, Family]> = [
  [/ngneered/, 'NGneered Projects'],
  [/interkonstruct/, 'Interkonstruct'],
  [/pmt\s*-?\s*7|integrated/, 'PMT7 Integrated'],
  [/konstructum/, 'Konstructum'],
];

export function familyFromEmail(email: string | null | undefined): Family | null {
  const text = String(email || '').trim().toLowerCase();
  const at = text.lastIndexOf('@');
  if (at === -1) return null;
  return DOMAIN_TO_FAMILY[text.slice(at + 1)] || null;
}

export function familyFromText(value: string | null | undefined): Family | null {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  for (const [pattern, family] of TEXT_PATTERNS) {
    if (pattern.test(text)) return family;
  }
  return null;
}

/**
 * Resolves a person's family, preferring the email domain.
 *
 * `department` is checked before `title` because a job title can contain a
 * family name incidentally ("Konstructum Graduate Trainee") whereas the
 * department is the field intended to hold it.
 */
export function resolveFamily(person: {
  email?: string | null;
  department?: string | null;
  title?: string | null;
}): string {
  return (
    familyFromEmail(person?.email)
    || familyFromText(person?.department)
    || familyFromText(person?.title)
    || FAMILY_OTHER
  );
}

/**
 * Guards against the approved-domain list and the family list drifting apart.
 * Called from the test suite; `api/` cannot import this module because Vercel
 * transpiles it file by file and does not ship anything outside `api/`.
 */
export function everyApprovedDomainHasAFamily(): string[] {
  return ALLOWED_EMAIL_DOMAINS.filter((domain) => !DOMAIN_TO_FAMILY[domain]);
}
