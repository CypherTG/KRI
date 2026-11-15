import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { HttpError, rawOne } from './db.js';

export const SESSION_COOKIE = 'kairos_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Founding administrator, plus any additional addresses pinned in the
 * ADMIN_EMAILS env var (comma separated). These are always admins
 * regardless of the users.is_admin column.
 */
export const DEFAULT_ADMIN_EMAILS = ['mbello@konstructum.com', 'onechief011@gmail.com'];

export function adminEmails(): string[] {
  const configured = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const merged = new Set<string>([...DEFAULT_ADMIN_EMAILS, ...configured]);
  return Array.from(merged);
}

export function isPinnedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(String(email).trim().toLowerCase());
}

/**
 * The only email domains that may hold a KAIROS account.
 *
 * This is an intranet for the group, so a personal or third-party mailbox has no
 * business in it. The list is fixed here rather than read from configuration on
 * purpose: it is a security boundary, and a boundary that can be quietly
 * weakened by an environment variable is not one. ALLOWED_EMAIL_DOMAINS can
 * only ever ADD domains, never remove them, so an operator cannot accidentally
 * or maliciously unlock the whole system by setting it.
 */
export const ALLOWED_EMAIL_DOMAINS = [
  'konstructum.com',
  'pmt7integrated.com',
  'interkonstruct.com',
  'ngneeredprojects.com',
] as const;

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

export function allowedEmailDomains(): string[] {
  const extra = String(process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  return Array.from(new Set<string>([...ALLOWED_EMAIL_DOMAINS, ...extra]));
}

/**
 * Whether this address may hold an account at all.
 *
 * Pinned administrators are exempt. That exemption is what lets the founding
 * administrator exist on a personal mailbox while everybody else is held to the
 * corporate domains.
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = String(email).trim().toLowerCase();
  if (isPinnedAdmin(normalised)) return true;
  const domain = emailDomain(normalised);
  return Boolean(domain) && allowedEmailDomains().includes(domain);
}

/** Message shown for any address outside the permitted domains. */
export function rejectedEmailMessage(): string {
  const domains = allowedEmailDomains().map((d) => `@${d}`).join(', ');
  return `KAIROS is restricted to company email addresses. Use an address at ${domains}.`;
}

/**
 * Enforces the domain policy. Called on both registration and sign-in: allowing
 * a stray account to be created but not used would leave dead rows in the users
 * table and give a false impression that the boundary is enforced.
 */
export function requireAllowedEmail(email: string): void {
  if (isAllowedEmail(email)) return;
  throw new HttpError(403, rejectedEmailMessage());
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new HttpError(
      500,
      'SESSION_SECRET is not configured or is too short. Generate one with: openssl rand -base64 48',
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  title: string;
  jobTitle: string;
  department: string;
  profilePhoto: string;
  isAdmin: boolean;
  isActive: boolean;
  /** True once the registrant has proved they control the mailbox. */
  isEmailVerified: boolean;
  targetClients: number;
  targetDeals: number;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function readCookie(req: VercelRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

export function setSessionCookie(res: VercelResponse, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
}

export function clearSessionCookie(res: VercelResponse) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function issueSessionToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('kairos')
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

async function userIdFromToken(req: VercelRequest): Promise<string | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'kairos' });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

const SESSION_CACHE_TTL_MS = 30_000;
const sessionCache = new Map<string, { user: SessionUser; expiresAt: number }>();

export function invalidateSessionCache(userId?: string): void {
  if (!userId) {
    sessionCache.clear();
    return;
  }
  sessionCache.delete(userId);
}

export const USER_PUBLIC_COLUMNS = `
  id, email, display_name, title, job_title, department,
  CASE
    WHEN profile_photo LIKE 'data:%' THEN '/api/profile-photo?userId=' || id::text
    ELSE coalesce(profile_photo, '')
  END AS profile_photo,
  is_admin, is_active, target_clients, target_deals, email_verified_at, join_date, created_at
`;

export async function loadSessionUser(req: VercelRequest): Promise<SessionUser | null> {
  const userId = await userIdFromToken(req);
  if (!userId) return null;

  const cached = sessionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const row = await rawOne<any>(
    `SELECT ${USER_PUBLIC_COLUMNS}
       FROM users
      WHERE id = $1`,
    [userId],
  );
  if (!row) return null;

  // An unverified account is inert. Re-reading the row on every request is what
  // makes that immediate rather than "for up to 30 days", which is what trusting
  // the token alone would mean.
  if (!row.email_verified_at) return null;

  const sessionUser = toSessionUser(row);
  sessionCache.set(userId, { user: sessionUser, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  return sessionUser;
}

/** Row → the camelCase session object the browser hydrates its auth store from. */
export function toSessionUser(row: any): SessionUser {
  const email = String(row?.email || '').toLowerCase();
  return {
    id: String(row?.id || ''),
    email,
    displayName: String(row?.display_name || row?.title || email || 'User'),
    title: String(row?.title || row?.display_name || ''),
    jobTitle: String(row?.job_title || ''),
    department: String(row?.department || ''),
    profilePhoto: String(row?.profile_photo || ''),
    isAdmin: Boolean(row?.is_admin) || isPinnedAdmin(email),
    isActive: row?.is_active !== false,
    // Surfaced for the client's own explanation; never used to grant access,
    // because requireSession refuses an unverified session outright.
    isEmailVerified: Boolean(row?.email_verified_at),
    targetClients: Number(row?.target_clients || 0),
    targetDeals: Number(row?.target_deals || 0),
  };
}

/** Throws 401 when there is no valid session. */
export async function requireSession(req: VercelRequest): Promise<SessionUser> {
  const user = await loadSessionUser(req);
  if (!user) throw new HttpError(401, 'You are signed out. Sign in to continue.');
  if (!user.isEmailVerified) {
    // The same message as a signed-out session. Naming the reason would tell an
    // attacker that the account they just created exists and is merely awaiting
    // confirmation.
    throw new HttpError(401, 'You are signed out. Sign in to continue.');
  }
  if (!user.isActive) throw new HttpError(403, 'Your account has been deactivated. Contact an administrator.');
  return user;
}

/** Throws 403 unless the session is an administrator. */
export async function requireAdmin(req: VercelRequest): Promise<SessionUser> {
  const user = await requireSession(req);
  if (!user.isAdmin) throw new HttpError(403, 'This action requires an administrator account.');
  return user;
}
