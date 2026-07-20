import { WebPartContext } from '@microsoft/sp-webpart-base';

export type GemsRole = 'admin' | 'manager' | 'contributor' | 'readonly';

const ADMIN_GROUPS = ['GEMS Administrators', 'KRI Administrators', 'Site Owners'];
const MANAGER_GROUPS = ['GEMS Managers', 'KRI Managers'];
const CONTRIBUTOR_GROUPS = ['GEMS Contributors', 'KRI Contributors', 'Site Members'];

let cachedRole: GemsRole | null = null;
let cachedEmail = '';

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export async function getCurrentUserRole(context: WebPartContext): Promise<GemsRole> {
  const email = normalizeEmail(context.pageContext.user.email || context.pageContext.user.loginName || '');
  if (cachedRole && cachedEmail === email) return cachedRole;

  try {
    const response = await fetch(`${context.pageContext.web.absoluteUrl}/_api/web/currentuser/groups`, {
      credentials: 'include',
      headers: { Accept: 'application/json;odata=nometadata', 'odata-version': '' },
    });
    if (!response.ok) { cachedRole = 'contributor'; cachedEmail = email; return cachedRole; }
    const json = await response.json();
    const groupNames: string[] = (json.value || []).map((g: any) => String(g.Title || ''));
    if (groupNames.some((name) => ADMIN_GROUPS.some((g) => name.includes(g)))) cachedRole = 'admin';
    else if (groupNames.some((name) => MANAGER_GROUPS.some((g) => name.includes(g)))) cachedRole = 'manager';
    else if (groupNames.some((name) => CONTRIBUTOR_GROUPS.some((g) => name.includes(g)))) cachedRole = 'contributor';
    else cachedRole = 'readonly';
    cachedEmail = email;
    return cachedRole;
  } catch {
    cachedRole = 'contributor';
    cachedEmail = email;
    return cachedRole;
  }
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
