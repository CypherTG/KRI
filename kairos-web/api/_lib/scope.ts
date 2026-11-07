import { HttpError, raw, rawOne } from './db.js';
import type { SessionUser } from './auth.js';

/**
 * Visibility mode.
 *
 *  'enforce' (default) — the intended design. A non-admin sees only the
 *      contacts they own (primary, secondary, or created) plus any contact
 *      shared with them through an approved, unexpired access request.
 *      This is enforced in SQL on every read, so it cannot be bypassed by
 *      the browser.
 *
 *  'open' — byte-for-byte the current SPFx behaviour, where
 *      `canViewClient()` returned `true` and every signed-in user saw the
 *      entire registry. Set PERMISSIONS_MODE=open to reproduce it.
 */
export type PermissionsMode = 'enforce' | 'open';

export function permissionsMode(): PermissionsMode {
  const rawMode = String(process.env.PERMISSIONS_MODE || 'enforce').trim().toLowerCase();
  return rawMode === 'open' ? 'open' : 'enforce';
}

export function canSeeEverything(user: SessionUser): boolean {
  if (permissionsMode() === 'open') return true;
  return user.isAdmin;
}

/**
 * A reusable SQL predicate restricting a query to the rows a user may read.
 *
 * @param alias  table alias the predicate is applied to, e.g. 'c'
 * @param owner  SQL expressions for the ownership columns on that alias
 * @param start  first placeholder index to consume
 * @param params mutable array the placeholders are pushed onto
 * @param user   the requesting session
 */
export function scopeSql(
  user: SessionUser,
  alias: string,
  owner: { primary: string; secondary: string; created: string },
  start: number,
  params: any[],
): string {
  if (canSeeEverything(user)) return 'TRUE';
  const uidPlaceholder = `$${start}`;
  const emailPlaceholder = `$${start + 1}`;
  params.push(user.id, user.email);
  return `(
    ${alias}.${owner.primary} = ${uidPlaceholder}
    OR ${alias}.${owner.secondary} = ${uidPlaceholder}
    OR ${alias}.${owner.created} = ${uidPlaceholder}
    OR EXISTS (
      SELECT 1
        FROM contact_access_requests r
       WHERE r.client_id = ${alias}.id
         AND lower(r.requester_key) = ${emailPlaceholder}
         AND r.status = 'Approved'
         AND (r.expires_at IS NULL OR r.expires_at > now())
    )
  )`;
}

/**
 * Ownership predicate used for WRITE authorisation: can this user modify
 * this contact at all? Admins always can; otherwise the user must own it.
 * Shared (approved) access is deliberately read-only, mirroring the SPFx
 * "Read-only shared access" chip in ClientDetail.
 */
export function ownsSql(
  user: SessionUser,
  alias: string,
  owner: { primary: string; secondary: string; created: string },
  start: number,
  params: any[],
): string {
  if (canSeeEverything(user)) return 'TRUE';
  const uidPlaceholder = `$${start}`;
  params.push(user.id);
  return `(${alias}.${owner.primary} = ${uidPlaceholder} OR ${alias}.${owner.secondary} = ${uidPlaceholder})`;
}

export const CLIENT_OWNERS = {
  primary: 'primary_contact_id',
  secondary: 'secondary_contact_id',
  created: 'created_by_id',
};

/** Throws 404 when the contact exists but is outside the caller's scope. */
export async function assertClientReadable(user: SessionUser, clientId: string) {
  const params: any[] = [clientId];
  const predicate = scopeSql(user, 'c', CLIENT_OWNERS, 2, params);
  const row = await rawOne(`SELECT c.id FROM clients c WHERE c.id = $1 AND ${predicate}`, params);
  if (!row) throw new HttpError(404, 'Contact not found, or you do not have access to it.');
  return row;
}

/** Throws 403 when the caller may read the contact but not modify it. */
export async function assertClientWritable(user: SessionUser, clientId: string) {
  const params: any[] = [clientId];
  const predicate = ownsSql(user, 'c', CLIENT_OWNERS, 2, params);
  const row = await rawOne(`SELECT c.id FROM clients c WHERE c.id = $1 AND ${predicate}`, params);
  if (!row) {
    throw new HttpError(
      403,
      'You can only edit contacts you own. Request access from the contact owner to make changes.',
    );
  }
  return row;
}

/** Throws 403 unless the caller may review access requests for this contact. */
export async function assertClientReviewable(user: SessionUser, clientId: string) {
  if (canSeeEverything(user)) return;
  const params: any[] = [clientId];
  const predicate = ownsSql(user, 'c', CLIENT_OWNERS, 2, params);
  const row = await rawOne(`SELECT c.id FROM clients c WHERE c.id = $1 AND ${predicate}`, params);
  if (!row) throw new HttpError(403, 'Only the contact owner or an administrator can review access requests.');
}

/** Throws 403 unless the caller owns this engagement (or is an admin). */
export async function assertEngagementWritable(user: SessionUser, engagementId: string) {
  if (canSeeEverything(user)) return;
  const row = await rawOne<any>(
    `SELECT e.id
       FROM engagements e
       JOIN clients c ON c.id = e.client_id
      WHERE e.id = $1
        AND (e.owned_by_id = $2 OR c.primary_contact_id = $2 OR c.secondary_contact_id = $2)`,
    [engagementId, user.id],
  );
  if (!row) throw new HttpError(403, 'You can only change deals you own.');
}

/** True when the caller owns the engagement. */
export async function engagementOwnedBy(user: SessionUser, engagementId: string): Promise<boolean> {
  if (canSeeEverything(user)) return true;
  const row = await rawOne<any>(
    `SELECT e.id
       FROM engagements e
       JOIN clients c ON c.id = e.client_id
      WHERE e.id = $1
        AND (e.owned_by_id = $2 OR c.primary_contact_id = $2 OR c.secondary_contact_id = $2)`,
    [engagementId, user.id],
  );
  return Boolean(row);
}

/** Bulk visibility check — returns the subset of client ids the user may read. */
export async function visibleClientIds(user: SessionUser, clientIds: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(clientIds.filter(Boolean)));
  if (!unique.length) return new Set();
  if (canSeeEverything(user)) return new Set(unique);
  const rows = await raw<{ id: string }>(
    `SELECT c.id
       FROM clients c
      WHERE c.id = ANY($1::text[])
        AND (${scopeSql(user, 'c', CLIENT_OWNERS, 2, [unique, user.id, user.email])})`,
    [unique, user.id, user.email],
  );
  return new Set(rows.map((row) => row.id));
}
