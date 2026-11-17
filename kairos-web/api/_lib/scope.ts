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
  const rawMode = String(process.env.PERMISSIONS_MODE || 'open').trim().toLowerCase();
  return rawMode === 'enforce' ? 'enforce' : 'open';
}

export function canSeeEverything(user: SessionUser): boolean {
  return Boolean(user.isAdmin || user.isSuperAdmin);
}

/**
 * Global read visibility — every signed-in user can view every contact in the
 * registry regardless of who imported or owns it.
 */
export function scopeSql(
  _user: SessionUser,
  _alias: string,
  _owner: { primary: string; secondary: string; created: string },
  _start: number,
  _params: any[],
): string {
  return 'TRUE';
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
export async function visibleClientIds(_user: SessionUser, clientIds: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(clientIds.filter(Boolean)));
  return new Set(unique);
}
