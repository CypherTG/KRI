import { HttpError } from './db.js';

/**
 * GEMS scope: the eight agencies GEMS monitors.
 *
 * Kept deliberately narrow. GEMS reads the *same* `clients` table as KAIROS, so
 * without this filter the app would expose the entire 400-contact registry —
 * most of which has nothing to do with government or regulator engagement. The
 * original SPFx build applied this in the browser, which meant the restriction
 * was cosmetic: the SharePoint REST API still returned every row. Here it is a
 * SQL predicate, so the data never leaves the server.
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

export type GemsAgency = (typeof GEMS_ALLOWED_AGENCIES)[number];

/**
 * Resolves free text to a monitored agency, or '' when it matches none.
 *
 * Order matters. `NEPL` and `NNPC` are matched first because a company name
 * like "NNPC Nigeria Ltd" would otherwise be caught by a looser test, and
 * because substring matching against the list is otherwise order-dependent.
 */
export function normalizeGemsAgency(value: string | null | undefined): GemsAgency | '' {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!key) return '';
  if (key.includes('nepl')) return 'NEPL';
  if (key.includes('nnpc')) return 'NNPC';
  const match = GEMS_ALLOWED_AGENCIES.find((agency) => key.includes(agency.toLowerCase()));
  return match || '';
}

export function isGemsEligible(value: string | null | undefined): boolean {
  return Boolean(normalizeGemsAgency(value));
}

/** Human-readable list, for the UI filter and error messages. */
export function gemsAgencyList(): string {
  return GEMS_ALLOWED_AGENCIES.join(', ');
}

/**
 * SQL predicate restricting `clients` to GEMS-eligible rows.
 *
 * @param alias  table alias the predicate is applied to, e.g. 'c'
 * @param params mutable array the agency values are appended to; the caller
 *               passes whatever placeholders it has already used
 *
 * The first placeholder index is derived from `params.length` rather than taken
 * as an argument. An earlier version took a `start` argument and computed
 * `start + params.length`, which double-counted whenever a caller passed its own
 * placeholders and produced queries referencing $10 with only nine values bound.
 *
 * The `::text` casts are required because Postgres cannot infer a type for an
 * untyped placeholder inside a concatenation, and the `lower()` on the right is
 * required because LIKE is case-sensitive: the agency constants are upper case
 * and the column is folded.
 */
export function gemsScopeSql(alias: string, params: any[]): string {
  const agencies = GEMS_ALLOWED_AGENCIES as readonly string[];
  const first = params.length + 1;
  const placeholders = agencies.map((_, index) => `$${first + index}`);
  params.push(...agencies);
  return `(${placeholders
    .map((p) => `lower(coalesce(${alias}.company_name, '')) LIKE '%' || lower(${p}::text) || '%'`)
    .join(' OR ')})`;
}

/**
 * A narrower predicate that resolves the agency to one of the eight.
 *
 * `gemsScopeSql` is substring matching, so it is used for listing. This one is
 * used when a record is written, so the stored `agency` column is always a real
 * monitored agency rather than whatever the user typed.
 */
export function resolveAgencyOrThrow(value: string | null | undefined): GemsAgency {
  const agency = normalizeGemsAgency(value);
  if (!agency) {
    throw new HttpError(
      400,
      `GEMS only covers ${gemsAgencyList()}. "${String(value || '').trim()}" is not one of them.`,
    );
  }
  return agency;
}
