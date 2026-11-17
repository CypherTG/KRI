import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { HttpError, raw, rawOne } from './db.js';

export const SESSION_COOKIE = 'kairos_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Founding Super Administrator, plus any additional addresses pinned in
 * SUPERADMIN_EMAILS / ADMIN_EMAILS env vars.
 */
export const DEFAULT_SUPERADMIN_EMAILS = ['mbello@konstructum.com'];
export const DEFAULT_ADMIN_EMAILS = ['mbello@konstructum.com', 'onechief011@gmail.com'];

export function superAdminEmails(): string[] {
  const configured = String(process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set<string>([...DEFAULT_SUPERADMIN_EMAILS, ...configured]));
}

export function isPinnedSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return superAdminEmails().includes(String(email).trim().toLowerCase());
}

export function adminEmails(): string[] {
  const configured = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const merged = new Set<string>([...DEFAULT_ADMIN_EMAILS, ...superAdminEmails(), ...configured]);
  return Array.from(merged);
}

export function isPinnedAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(String(email).trim().toLowerCase());
}

export const ALLOWED_EMAIL_DOMAINS = [
  'konstructum.com',
  'pmt7integrated.com',
  'interkonstruct.com',
  'ngneeredprojects.com',
  'kcc.com',
] as const;

let cachedDbDomains: Array<{ domain: string; label: string; is_active: boolean }> | null = null;
let cachedDbDomainsExpiresAt = 0;

export function invalidateDomainsCache(): void {
  cachedDbDomains = null;
  cachedDbDomainsExpiresAt = 0;
}

export async function getAllowedDomainsList(): Promise<Array<{ domain: string; label: string; is_active: boolean }>> {
  if (cachedDbDomains && cachedDbDomainsExpiresAt > Date.now()) {
    return cachedDbDomains;
  }
  try {
    const rows = await raw<any>(
      `SELECT domain, label, is_active FROM allowed_domains ORDER BY domain ASC`,
    );
    if (rows && rows.length > 0) {
      cachedDbDomains = rows.map((r: any) => ({
        domain: String(r.domain || '').trim().toLowerCase(),
        label: String(r.label || r.domain || '').trim(),
        is_active: r.is_active !== false,
      }));
      cachedDbDomainsExpiresAt = Date.now() + 15_000;
      return cachedDbDomains;
    }
  } catch {
    // Fallback to static defaults if table not yet migrated
  }
  const fallback = [
    { domain: 'konstructum.com', label: 'Konstructum', is_active: true },
    { domain: 'pmt7integrated.com', label: 'PMT7 Integrated', is_active: true },
    { domain: 'interkonstruct.com', label: 'Interkonstruct', is_active: true },
    { domain: 'ngneeredprojects.com', label: 'NGneered Projects', is_active: true },
    { domain: 'kcc.com', label: 'KCC', is_active: true },
  ];
  cachedDbDomains = fallback;
  cachedDbDomainsExpiresAt = Date.now() + 5_000;
  return fallback;
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

export function allowedEmailDomains(): string[] {
  const extra = String(process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  const dbActive = (cachedDbDomains || [])
    .filter((d) => d.is_active)
    .map((d) => d.domain);
  return Array.from(new Set<string>([...ALLOWED_EMAIL_DOMAINS, ...dbActive, ...extra]));
}

export async function allowedEmailDomainsAsync(): Promise<string[]> {
  const list = await getAllowedDomainsList();
  const active = list.filter((d) => d.is_active).map((d) => d.domain);
  const extra = String(process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  const merged = Array.from(new Set<string>([...active, ...extra]));
  return merged.length > 0 ? merged : [...ALLOWED_EMAIL_DOMAINS];
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalised = String(email).trim().toLowerCase();
  if (isPinnedAdmin(normalised) || isPinnedSuperAdmin(normalised)) return true;
  const domain = emailDomain(normalised);
  return Boolean(domain) && allowedEmailDomains().includes(domain);
}

export async function isAllowedEmailAsync(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const normalised = String(email).trim().toLowerCase();
  if (isPinnedAdmin(normalised) || isPinnedSuperAdmin(normalised)) return true;
  const domain = emailDomain(normalised);
  if (!domain) return false;
  const allowed = await allowedEmailDomainsAsync();
  return allowed.includes(domain);
}

export function rejectedEmailMessage(domainsList?: string[]): string {
  const domains = (domainsList && domainsList.length ? domainsList : allowedEmailDomains())
    .map((d) => `@${d}`)
    .join(', ');
  return `Access is restricted to approved company domains (${domains}). Contact your Super Administrator to allow a new domain.`;
}

export function requireAllowedEmail(email: string): void {
  if (isAllowedEmail(email)) return;
  throw new HttpError(403, rejectedEmailMessage());
}

export async function requireAllowedEmailAsync(email: string): Promise<void> {
  const allowed = await isAllowedEmailAsync(email);
  if (allowed) return;
  const domains = await allowedEmailDomainsAsync();
  throw new HttpError(403, rejectedEmailMessage(domains));
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
  isSuperAdmin: boolean;
  isActive: boolean;
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

export function readBearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization || (req.headers as any).Authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
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
  return new SignJWT({ sub: String(userId), email: String(email).toLowerCase() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('kairos')
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

async function verifyJwtToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'kairos' });
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

async function userIdFromToken(req: VercelRequest): Promise<string | null> {
  const bearer = readBearerToken(req);
  if (bearer) {
    const sub = await verifyJwtToken(bearer);
    if (sub) return sub;
  }
  const cookieToken = readCookie(req, SESSION_COOKIE);
  if (cookieToken) {
    const sub = await verifyJwtToken(cookieToken);
    if (sub) return sub;
  }
  return null;
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
  is_admin, COALESCE(is_superadmin, false) AS is_superadmin, is_active,
  target_clients, target_deals, email_verified_at, join_date, created_at
`;

export async function loadSessionUser(req: VercelRequest): Promise<SessionUser | null> {
  const userId = await userIdFromToken(req);
  if (!userId) return null;

  const cached = sessionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  let row: any = null;
  try {
    row = await rawOne<any>(
      `SELECT ${USER_PUBLIC_COLUMNS}
         FROM users
        WHERE id = $1`,
      [userId],
    );
  } catch {
    row = await rawOne<any>(
      `SELECT id, email, display_name, title, job_title, department,
              CASE
                WHEN profile_photo LIKE 'data:%' THEN '/api/profile-photo?userId=' || id::text
                ELSE coalesce(profile_photo, '')
              END AS profile_photo,
              is_admin, false AS is_superadmin, is_active,
              target_clients, target_deals, email_verified_at, join_date, created_at
         FROM users
        WHERE id = $1`,
      [userId],
    );
  }
  if (!row) return null;
  if (row.is_active === false) return null;

  if (!row.email_verified_at) {
    row.email_verified_at = new Date().toISOString();
    void raw(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, [userId]).catch(() => {});
  }

  const sessionUser = toSessionUser(row);
  sessionCache.set(userId, { user: sessionUser, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  return sessionUser;
}

export function toSessionUser(row: any): SessionUser {
  const email = String(row?.email || '').toLowerCase();
  const isSuperAdmin = Boolean(row?.is_superadmin) || isPinnedSuperAdmin(email);
  const isAdmin = Boolean(row?.is_admin) || isSuperAdmin || isPinnedAdmin(email);
  return {
    id: String(row?.id || ''),
    email,
    displayName: String(row?.display_name || row?.title || email || 'User'),
    title: String(row?.title || row?.display_name || ''),
    jobTitle: String(row?.job_title || ''),
    department: String(row?.department || ''),
    profilePhoto: String(row?.profile_photo || ''),
    isAdmin,
    isSuperAdmin,
    isActive: row?.is_active !== false,
    isEmailVerified: true,
    targetClients: Number(row?.target_clients || 0),
    targetDeals: Number(row?.target_deals || 0),
  };
}

export async function requireSession(req: VercelRequest): Promise<SessionUser> {
  const user = await loadSessionUser(req);
  if (!user) throw new HttpError(401, 'You are signed out. Sign in to continue.');
  if (!user.isActive) throw new HttpError(403, 'Your account has been deactivated. Contact an administrator.');
  return user;
}

export async function requireAdmin(req: VercelRequest): Promise<SessionUser> {
  const user = await requireSession(req);
  if (!user.isAdmin && !user.isSuperAdmin) {
    throw new HttpError(403, 'This action requires an Administrator account.');
  }
  return user;
}

export async function requireSuperAdmin(req: VercelRequest): Promise<SessionUser> {
  const user = await requireSession(req);
  if (!user.isSuperAdmin) {
    throw new HttpError(403, 'This action requires a Super Administrator account.');
  }
  return user;
}
