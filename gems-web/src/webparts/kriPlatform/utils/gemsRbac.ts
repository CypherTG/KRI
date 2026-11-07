import { KriContext } from '../../../types/kri';

export type GemsRole = 'admin' | 'manager' | 'contributor' | 'readonly';

const ADMIN_GROUPS = ['GEMS Administrators', 'KRI Administrators', 'Site Owners'];
const MANAGER_GROUPS = ['GEMS Managers', 'KRI Managers'];
const CONTRIBUTOR_GROUPS = ['GEMS Contributors', 'KRI Contributors', 'Site Members'];

const ADMIN_EMAILS = ['mbello@konstructum.com', 'onechief011@gmail.com'];

let cachedRole: GemsRole | null = null;
let cachedEmail = '';

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export async function getCurrentUserRole(context: KriContext): Promise<GemsRole> {
  const email = normalizeEmail(
    context?.session?.email || context?.pageContext?.user?.email || context?.pageContext?.user?.loginName || '',
  );
  if (context?.session?.isAdmin || (context?.pageContext?.user as any)?.isAdmin || ADMIN_EMAILS.includes(email)) {
    cachedRole = 'admin';
    cachedEmail = email;
    return 'admin';
  }
  if (cachedRole && cachedEmail === email) return cachedRole;
  cachedRole = 'contributor';
  cachedEmail = email;
  return cachedRole;
}

export function canEdit(role: GemsRole): boolean {
  return role === 'admin' || role === 'manager' || role === 'contributor';
}

export function canManage(role: GemsRole): boolean {
  return role === 'admin' || role === 'manager';
}

export function canAdmin(role: GemsRole): boolean {
  return role === 'admin';
}
