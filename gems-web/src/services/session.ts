import { create } from 'zustand';
import {
  KriContext,
  KriSessionUser,
  UnauthorisedError,
  apiRequest,
  buildContext,
  onUnauthorised,
  setStoredAuthToken,
} from '../types/kri';

type SessionState = 'loading' | 'anonymous' | 'authenticated';

interface KriAuthState {
  status: SessionState;
  user: KriSessionUser | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  context: KriContext | null;
  error: string | null;
  needsToken: boolean;
  notice: string | null;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string, token?: string) => Promise<void>;
  loginWithSso: (input: { email?: string; ssoToken?: string }) => Promise<void>;
  register: (input: { email: string; password: string; displayName?: string; jobTitle?: string }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  clearNotice: () => void;
  setNeedsToken: (needsToken: boolean) => void;
  probeNeedsToken: (email: string) => Promise<boolean>;
  resendCode: (email: string) => Promise<void>;
  setUser: (user: KriSessionUser, isAdmin: boolean) => void;
  refresh: () => Promise<void>;
}

function adopt(
  set: (partial: Partial<KriAuthState>) => void,
  user: KriSessionUser,
  isAdmin: boolean,
  isSuperAdmin?: boolean,
) {
  const superAdmin =
    Boolean(isSuperAdmin)
    || Boolean(user.isSuperAdmin)
    || String(user.email || '').trim().toLowerCase() === 'mbello@konstructum.com';
  const admin = Boolean(isAdmin) || Boolean(user.isAdmin) || superAdmin;
  const enrichedUser: KriSessionUser = {
    ...user,
    isAdmin: admin,
    isSuperAdmin: superAdmin,
  };
  set({
    status: 'authenticated',
    user: enrichedUser,
    isAdmin: admin,
    isSuperAdmin: superAdmin,
    context: buildContext(enrichedUser),
    error: null,
    notice: null,
    needsToken: false,
  });
}

export const useAuth = create<KriAuthState>((set, get) => ({
  status: 'loading',
  user: null,
  isAdmin: false,
  isSuperAdmin: false,
  context: null,
  error: null,
  needsToken: false,
  notice: null,

  async bootstrap() {
    // 1. Check if launched from Group Intranet or cross-app with ?sso_token=... or ?intranet_email=...
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlSsoToken = params.get('sso_token') || params.get('ssoToken') || '';
        const urlSsoEmail = params.get('sso_email') || params.get('intranet_email') || '';
        if (urlSsoToken || urlSsoEmail) {
          params.delete('sso_token');
          params.delete('ssoToken');
          params.delete('sso_email');
          params.delete('intranet_email');
          const cleanSearch = params.toString();
          const cleanUrl = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`;
          window.history.replaceState({}, '', cleanUrl);

          const ssoRes = await apiRequest<{
            token?: string;
            user: KriSessionUser;
            isAdmin: boolean;
            isSuperAdmin?: boolean;
          }>('/auth/login', {
            method: 'POST',
            body: {
              mode: 'sso',
              ...(urlSsoToken ? { ssoToken: urlSsoToken } : {}),
              ...(urlSsoEmail ? { email: urlSsoEmail } : {}),
            },
          });
          if (ssoRes?.user) {
            if (ssoRes.token) setStoredAuthToken(ssoRes.token);
            adopt(set, ssoRes.user, Boolean(ssoRes.isAdmin), Boolean(ssoRes.isSuperAdmin));
            return;
          }
        }
      } catch {
        // Fall through to standard session check
      }
    }

    // 2. Standard session resolution
    try {
      const result = await apiRequest<{
        token?: string;
        user: KriSessionUser;
        isAdmin: boolean;
        isSuperAdmin?: boolean;
      }>('/auth/session');
      if (result?.user) {
        if (result.token) setStoredAuthToken(result.token);
        adopt(set, result.user, Boolean(result.isAdmin), Boolean(result.isSuperAdmin));
      } else {
        set({ status: 'anonymous', user: null, isAdmin: false, isSuperAdmin: false, context: null });
      }
    } catch {
      set({ status: 'anonymous', user: null, isAdmin: false, isSuperAdmin: false, context: null });
    }
  },

  async login(email, password, token) {
    set({ error: null });
    try {
      const result = await apiRequest<{
        token?: string;
        user: KriSessionUser;
        isAdmin: boolean;
        isSuperAdmin?: boolean;
      }>('/auth/login', {
        method: 'POST',
        body: { email, password, ...(token ? { token } : {}) },
      });
      if (result.token) setStoredAuthToken(result.token);
      if (typeof window !== 'undefined') {
        try {
          if (result.isAdmin || result.isSuperAdmin) {
            window.localStorage.setItem('gems.workspaceViewMode', 'admin');
          }
          if (window.location.pathname !== '/') {
            window.history.replaceState({}, '', '/');
          }
        } catch {
          // ignore storage/history errors
        }
      }
      adopt(set, result.user, Boolean(result.isAdmin), Boolean(result.isSuperAdmin));
    } catch (error) {
      const needsToken = Boolean((error as { needsToken?: boolean })?.needsToken);
      if (needsToken) set({ needsToken: true });

      const message = error instanceof Error ? error.message : 'Sign in failed.';
      set({ error: message });
      throw error;
    }
  },

  async loginWithSso(input) {
    set({ error: null });
    try {
      const result = await apiRequest<{
        token?: string;
        user: KriSessionUser;
        isAdmin: boolean;
        isSuperAdmin?: boolean;
      }>('/auth/login', {
        method: 'POST',
        body: {
          mode: 'sso',
          ...(input.email ? { email: input.email.trim().toLowerCase() } : {}),
          ...(input.ssoToken ? { ssoToken: input.ssoToken.trim() } : {}),
        },
      });
      if (result.token) setStoredAuthToken(result.token);
      if (typeof window !== 'undefined') {
        try {
          if (result.isAdmin || result.isSuperAdmin) {
            window.localStorage.setItem('gems.workspaceViewMode', 'admin');
          }
          if (window.location.pathname !== '/') {
            window.history.replaceState({}, '', '/');
          }
        } catch {
          // ignore storage/history errors
        }
      }
      adopt(set, result.user, Boolean(result.isAdmin), Boolean(result.isSuperAdmin));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Group Intranet SSO sign-in failed.';
      set({ error: message });
      throw error;
    }
  },

  async register(input) {
    set({ error: null, notice: null });
    try {
      const result = await apiRequest<{
        user?: KriSessionUser;
        isAdmin?: boolean;
        isSuperAdmin?: boolean;
      }>('/auth/register', {
        method: 'POST',
        body: input,
      });
      if (result?.user) {
        adopt(set, result.user, Boolean(result.isAdmin), Boolean(result.isSuperAdmin));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Account provisioning failed.';
      set({ error: message });
      throw error;
    }
  },

  async probeNeedsToken(_email) {
    return false;
  },

  async resendCode(email) {
    await apiRequest('/auth/resend-code', { method: 'POST', body: { email } });
  },

  async logout() {
    setStoredAuthToken(null);
    try {
      await apiRequest('/auth/session', { method: 'POST' });
    } catch {
      /* clearing locally is enough */
    }
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      try { window.history.replaceState({}, '', '/'); } catch {}
    }
    set({ status: 'anonymous', user: null, isAdmin: false, isSuperAdmin: false, context: null, error: null });
  },

  clearError() {
    set({ error: null });
  },

  clearNotice() {
    set({ notice: null });
  },

  setNeedsToken(needsToken) {
    set({ needsToken });
  },

  setUser(user, isAdmin) {
    adopt(set, user, isAdmin, user.isSuperAdmin);
  },

  async refresh() {
    if (get().status !== 'authenticated') return;
    try {
      const result = await apiRequest<{
        token?: string;
        user: KriSessionUser;
        isAdmin: boolean;
        isSuperAdmin?: boolean;
      }>('/auth/session');
      if (result?.user) {
        if (result.token) setStoredAuthToken(result.token);
        adopt(set, result.user, Boolean(result.isAdmin), Boolean(result.isSuperAdmin));
      }
    } catch {
      // ignore refresh error
    }
  },
}));

onUnauthorised(() => {
  const current = useAuth.getState();
  if (current.status === 'authenticated') {
    setStoredAuthToken(null);
    useAuth.setState({ status: 'anonymous', user: null, isAdmin: false, isSuperAdmin: false, context: null });
  }
});

export { UnauthorisedError };
