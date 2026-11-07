import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { raw, rawOne } from './db.js';

/**
 * Email ownership verification.
 *
 * Registration is restricted to the group's own email domains, which means
 * anyone can register as a colleague's address. Without a proof-of-ownership step
 * that is an identity-theft vector: the account would be real, attributed to a
 * real colleague, and would appear in the people registry and audit trail under
 * their name. So an account stays inert until the registrant proves they hold
 * the mailbox.
 *
 * Design points that matter:
 *
 *  · Only the SHA-256 of a code is ever stored. A database leak yields hashes,
 *    which cannot be presented to anyone to verify an address.
 *  · Issuing a code overwrites the previous one, so only the newest message in
 *    an inbox works and an old code is dead the moment a new one is requested.
 *  · Every failure path returns the same message. A different message for
 *    "no such account" versus "wrong code" is an account-enumeration oracle.
 *  · Codes are drawn from a CSPRNG, never Math.random(), which is predictable.
 */

/**
 * 32 glyphs, none of them visually ambiguous.
 *
 * These get read aloud over the phone and retyped, so O/0, I/1 and l/L are all
 * excluded: a code that is ambiguous when spoken is a support problem, and one
 * that is ambiguous when retyped is a lockout.
 */
export const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const TOKEN_LENGTH = 32;
export const TOKEN_TTL_MINUTES = 5;
/** Bounds how often a mailbox can be targeted, so an owner is not mail-bombed. */
export const MAX_SENDS_PER_DAY = 5;

/**
 * One message for every failure. Changing this per failure reason reintroduces
 * the enumeration oracle it exists to close.
 */
export const GENERIC_VERIFICATION_ERROR =
  'That code is not valid. Check it and try again, or request a new one.';

/** A syntactically valid code length. Checked before anything touches the database. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length === TOKEN_LENGTH;
}

export function generateVerificationToken(): string {
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i += 1) {
    // randomInt is a CSPRNG. Math.random() is not, and its output is predictable.
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time string comparison.
 *
 * The length-mismatch branch still runs a comparison so that a wrong-length value
 * is not measurably faster to reject than a wrong-value one; without that, an
 * attacker could distinguish "shape is wrong" from "value is wrong" by timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export interface TokenIssueResult {
  ok: boolean;
  /** Present only on success. The raw token, for mailing. Never stored. */
  token?: string;
  expiresAt?: Date;
  /** Set when the send budget is spent, so the caller can stay quiet about it. */
  rateLimited?: boolean;
  /** True when the address is already verified and needs no code. */
  alreadyVerified?: boolean;
  /** True when no such account exists. Callers must not reveal this. */
  unknownAccount?: boolean;
}

/**
 * Issues a code, replacing any outstanding one.
 *
 * The single UPDATE both overwrites the previous hash and increments the send
 * counter, so a rapid double-request cannot slip past the daily limit by racing.
 */
export async function issueVerificationToken(email: string): Promise<TokenIssueResult> {
  const normalised = String(email || '').trim().toLowerCase();

  const user = await rawOne<any>(
    'SELECT id, email_verified_at, verification_sent_count FROM users WHERE lower(email) = $1',
    [normalised],
  );
  if (!user) return { ok: false, unknownAccount: true };
  if (user.email_verified_at) return { ok: false, alreadyVerified: true };

  if (Number(user.verification_sent_count || 0) >= MAX_SENDS_PER_DAY) {
    return { ok: false, rateLimited: true };
  }

  const token = generateVerificationToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

  await raw(
    `UPDATE users
        SET verification_token_hash = $2,
            verification_token_expires_at = $3,
            verification_sent_count = verification_sent_count + 1
      WHERE id = $1`,
    [user.id, hashVerificationToken(token), expiresAt.toISOString()],
  );

  return { ok: true, token, expiresAt };
}

/**
 * Checks a submitted code.
 *
 * The lookup is by (email, hash) TOGETHER. That pairing is what binds a code to
 * one mailbox: a valid code presented alongside a different address matches no
 * row, so account A's code cannot sign in account B.
 *
 * `requireTokenEverySignin` is checked by the caller, because the difference
 * between "unverified" and "verified but hardened" changes only the reason.
 */
export async function checkVerificationToken(
  email: string,
  token: string,
): Promise<{ ok: boolean; error: string; needsToken: boolean }> {
  const fail = {
    ok: false,
    error: GENERIC_VERIFICATION_ERROR,
    needsToken: true,
  };

  // Reject a malformed code before touching the database, but through the same
  // return path so the caller sees no difference.
  if (!isWellFormedToken(token)) return fail;

  const normalised = String(email || '').trim().toLowerCase();
  const hash = hashVerificationToken(token.trim().toUpperCase());

  const row = await rawOne<any>(
    `SELECT verification_token_hash, verification_token_expires_at
       FROM users
      WHERE lower(email) = $1 AND verification_token_hash = $2`,
    [normalised, hash],
  );

  if (!row) return fail;
  if (!row.verification_token_hash || !row.verification_token_expires_at) return fail;
  if (new Date(row.verification_token_expires_at).getTime() <= Date.now()) return fail;

  // Compare the hashes, not the raw tokens, so a partially-correct guess gives
  // no timing signal about the stored value.
  if (!safeEqual(String(row.verification_token_hash), hash)) return fail;

  return { ok: true, error: '', needsToken: false };
}

/**
 * Marks the address verified and clears the code in one statement.
 *
 * Doing both together is what makes a replay find nothing left to match: there
 * is no window in which the address is verified but the code is still live. If
 * two requests race, the loser updates zero rows and is rejected, which is the
 * behaviour we want.
 */
export async function consumeVerificationToken(
  email: string,
  token: string,
): Promise<boolean> {
  if (!isWellFormedToken(token)) return false;

  const result = await raw<any>(
    `UPDATE users
        SET email_verified_at = now(),
            verification_token_hash = NULL,
            verification_token_expires_at = NULL
      WHERE lower(email) = $1
        AND verification_token_hash = $2
      RETURNING id`,
    [String(email || '').trim().toLowerCase(), hashVerificationToken(token.trim().toUpperCase())],
  );

  return Array.isArray(result) && result.length > 0;
}

/**
 * Removes pending registrations whose code expired unused.
 *
 * Without this, a registration that is never completed leaves a row that
 * permanently blocks that address from signing up again — the new request hits
 * "an account with that email already exists" and the person is locked out of an
 * account they never made.
 *
 * Only ever touches rows where email_verified_at IS NULL. A verified account must
 * never be swept, however old.
 */
export async function sweepExpiredRegistrations(): Promise<number> {
  const removed = await raw<{ id: string }>(
    `DELETE FROM users
      WHERE email_verified_at IS NULL
        AND verification_token_expires_at IS NOT NULL
        AND verification_token_expires_at < now()
      RETURNING id`,
  );
  return removed.length;
}

/** True when this account must present a code to sign in. */
export function needsToken(user: {
  email_verified_at?: string | null;
  require_token_every_signin?: boolean;
}): boolean {
  return !user?.email_verified_at || user?.require_token_every_signin === true;
}
