import { useEffect, useState } from 'react';
import { KriContext } from '../../../types/kri';

export type GemsRole = 'admin' | 'manager' | 'contributor' | 'readonly';
export type GemsViewMode = 'admin' | 'user';

const ADMIN_EMAILS = ['mbello@konstructum.com'];
const VIEW_MODE_STORAGE_KEY = 'gems.workspaceViewMode';
const VIEW_MODE_EVENT = 'gems:view-mode-changed';

let cachedRole: GemsRole | null = null;
let cachedEmail = '';

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function isActualGemsAdmin(context: KriContext | null | undefined): boolean {
  if (!context) return false;
  const email = normalizeEmail(
    context?.session?.email || context?.pageContext?.user?.email || context?.pageContext?.user?.loginName || '',
  );
  return Boolean(
    context?.session?.isAdmin || (context?.pageContext?.user as any)?.isAdmin || ADMIN_EMAILS.includes(email),
  );
}

export function getStoredGemsViewMode(defaultMode: GemsViewMode = 'admin'): GemsViewMode {
  if (typeof window === 'undefined') return defaultMode;
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (raw === 'user' || raw === 'admin') return raw;
  } catch {
    // ignore storage errors
  }
  return defaultMode;
}

export function setStoredGemsViewMode(mode: GemsViewMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT, { detail: mode }));
  } catch {
    // ignore storage errors
  }
}

export function useGemsViewMode(context: KriContext): {
  isAccountAdmin: boolean;
  viewMode: GemsViewMode;
  effectiveIsAdmin: boolean;
  setViewMode: (mode: GemsViewMode) => void;
} {
  const isAccountAdmin = isActualGemsAdmin(context);
  const [viewMode, setViewModeState] = useState<GemsViewMode>(() =>
    isAccountAdmin ? getStoredGemsViewMode('admin') : 'user',
  );

  useEffect(() => {
    if (!isAccountAdmin) {
      setViewModeState('user');
      return;
    }
    setViewModeState(getStoredGemsViewMode('admin'));
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<GemsViewMode>).detail;
      if (detail === 'admin' || detail === 'user') {
        setViewModeState(detail);
      } else {
        setViewModeState(getStoredGemsViewMode('admin'));
      }
    };
    window.addEventListener(VIEW_MODE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(VIEW_MODE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, [isAccountAdmin]);

  const setViewMode = (mode: GemsViewMode) => {
    const next = isAccountAdmin ? mode : 'user';
    setStoredGemsViewMode(next);
    setViewModeState(next);
  };

  return {
    isAccountAdmin,
    viewMode: isAccountAdmin ? viewMode : 'user',
    effectiveIsAdmin: isAccountAdmin && viewMode === 'admin',
    setViewMode,
  };
}

export async function getCurrentUserRole(context: KriContext): Promise<GemsRole> {
  const email = normalizeEmail(
    context?.session?.email || context?.pageContext?.user?.email || context?.pageContext?.user?.loginName || '',
  );
  if (isActualGemsAdmin(context)) {
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
