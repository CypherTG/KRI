/**
 * The email domains KAIROS accepts, mirrored for the browser.
 *
 * The server is the authority — `api/_lib/auth.ts` holds the same list and
 * rejects anything else regardless of what the client does. This copy exists so
 * the sign-in form can say "use your work address" while you are typing instead
 * of after a round trip.
 *
 * api/ is deployed file-by-file and does not bundle, so it cannot import from
 * here, which is why the list is stated twice. The two are compared in the test
 * suite (`scripts/smoke.ts`), so a change to one without the other fails the
 * build rather than quietly disagreeing in production.
 */
export const ALLOWED_EMAIL_DOMAINS = [
  'konstructum.com',
  'pmt7integrated.com',
  'interkonstruct.com',
  'ngneeredprojects.com',
];

export function emailDomain(email: string): string {
  const trimmed = String(email || '').trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  return at === -1 ? '' : trimmed.slice(at + 1);
}

/**
 * True when the address is on a permitted domain.
 *
 * The founding administrator is exempt here too, so the form does not tell a
 * legitimately exempt person that their own address is not allowed.
 */
export function isAllowedEmail(email: string, exemptEmails: string[] = []): boolean {
  const trimmed = String(email || '').trim().toLowerCase();
  if (!trimmed) return true; // Nothing typed yet; not an error.
  if (exemptEmails.includes(trimmed)) return true;
  const domain = emailDomain(trimmed);
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}
