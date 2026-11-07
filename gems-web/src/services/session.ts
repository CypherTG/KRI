import { create } from 'zustand';
import {
  KriContext,
  KriSessionUser,
  UnauthorisedError,
  apiRequest,
  buildContext,
  onUnauthorised,
} from '../types/kri';

type SessionState = 'loading' | 'anonymous' | 'authenticated';

interface KriAuthState {
  status: SessionState;
  user: KriSessionUser | null;
  isAdmin: boolean;
  context: KriContext | null;
  error: string | null;

  /**
   * True when the account must present an emailed code.
   *
   * Set by the sign-in probe, and also by a sign-in attempt that comes back
   * `needsToken: true`. The second source matters: if the probe never fired —
   * the address was pasted rather than typed, or the debounce was interrupted —
   * the code field must still appear, or the person is stuck with no way to
   * enter their code.
   */
  needsToken: boolean;
  /** Message shown after a successful sign-up, before verification. */
  notice: string | null;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string, token?: string) => Promise<void>;
  register: (input: { email: string; password: string; displayName?: string; jobTitle?: string }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  clearNotice: () => void;
  setNeedsToken: (needsToken: boolean) => void;
  /** Asks the server whether this address is waiting on a code. */
  probeNeedsToken: (email: string) => Promise<boolean>;
  /** Requests another code. Always reports success, by design. */
  resendCode: (email: string) => Promise<void>;
  setUser: (user: KriSessionUser, isAdmin: boolean) => void;
  /**
   * Re-reads the session from the server and rebuilds the context.
   *
   * Needed after a change that alters the signed-in user rather than the data
   * they are looking at — a profile photo, say — so the header avatar and every
   * other consumer of `context.session` see it immediately instead of on the
   * next page load.
   */
  refresh: () => Promise<void>;
}

function adopt(
  set: (partial: Partial<KriAuthState>) => void,
  user: KriSessionUser,
  isAdmin: boolean,
) {
  set({
    status: 'authenticated',
    user,
    isAdmin,
    context: buildContext(user),
    error: null,
    notice: null,
    // A live session is always a verified one — the server refuses to issue any
    // other — so the code field can be cleared on sign-in.
    needsToken: false,
  });
}

export const useAuth = create<KriAuthState>((set, get) => ({
  status: 'loading',
  user: null,
  isAdmin: false,
  context: null,
  error: null,
  needsToken: false,
  notice: null,

  async bootstrap() {
    try {
      const result = await apiRequest<{ user: KriSessionUser; isAdmin: boolean }>('/auth/session');
      if (result?.user) {
        adopt(set, result.user, Boolean(result.isAdmin));
      } else {
        set({ status: 'anonymous', user: null, isAdmin: false, context: null });
      }
    } catch {
      set({ status: 'anonymous', user: null, isAdmin: false, context: null });
    }
  },

  async login(email, password, token) {
    set({ error: null });
    try {
      const result = await apiRequest<{ user: KriSessionUser; isAdmin: boolean }>('/auth/login', {
        method: 'POST',
        body: { email, password, ...(token ? { token } : {}) },
      });
      adopt(set, result.user, Boolean(result.isAdmin));
    } catch (error) {
      // A refusal carrying needsToken means the account is waiting on a code, so
      // the form reveals the field. This is the fallback that saves a person whose
      // probe never fired.
      const needsToken = Boolean((error as { needsToken?: boolean })?.needsToken);
      if (needsToken) set({ needsToken: true });

      const message = error instanceof Error ? error.message : 'Sign in failed.';
      set({ error: message });
      throw error;
    }
  },

  async register(input) {
    set({ error: null, notice: null });
    try {
      const result = await apiRequest<{
        requiresVerification?: boolean;
        email?: string;
        user?: KriSessionUser;
        isAdmin?: boolean;
      }>('/auth/register', {
        method: 'POST',
        body: input,
      });
      if (result?.user) {
        adopt(set, result.user, Boolean(result.isAdmin));
        return;
      }
      // No session is issued. The account exists but is inert until the emailed
      // code is redeemed, so the form moves to sign-in with the code field shown.
      set({
        status: 'anonymous',
        user: null,
        isAdmin: false,
        context: null,
        error: null,
        needsToken: true,
        notice: `We sent a verification code to ${input.email}. Enter it below to activate your account.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed.';
      set({ error: message });
      throw error;
    }
  },

  async probeNeedsToken(email) {
    try {
      const result = await apiRequest<{ needsToken: boolean }>('/auth/sign-in', {
        query: { email },
      });
      const needs = Boolean(result?.needsToken);
      // Only ever turns the field ON from a probe. A false result is not latched,
      // because the probe may have fired against a half-typed address.
      if (needs) set({ needsToken: true });
      return needs;
    } catch {
      // A failed probe must not hide the field, and must not show it wrongly
      // either; leaving the current state alone is the safe default.
      return false;
    }
  },

  async resendCode(email) {
    // Always reports success. The endpoint returns an identical response whether
    // or not the address exists, and surfacing a failure here would turn the
    // button into an enumeration oracle.
    await apiRequest('/auth/resend-code', { method: 'POST', body: { email } });
  },

  async logout() {
    try {
      await apiRequest('/auth/session', { method: 'POST' });
    } catch {
      /* clearing locally is enough */
    }
    set({ status: 'anonymous', user: null, isAdmin: false, context: null, error: null });
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
    adopt(set, user, isAdmin);
  },

  async refresh() {
    if (get().status !== 'authenticated') return;
    try {
      const result = await apiRequest<{ user: KriSessionUser; isAdmin: boolean }>('/auth/session');
      if (result?.user) adopt(set, result.user, Boolean(result.isAdmin));
    } catch {
      // A failed refresh must not sign the user out; the next request will
      // surface a 401 on its own terms.
    }
  },
}));

// A 401 from any request drops the whole app back to the sign-in screen.
onUnauthorised(() => {
  const current = useAuth.getState();
  if (current.status === 'authenticated') {
    useAuth.setState({ status: 'anonymous', user: null, isAdmin: false, context: null });
  }
});

export { UnauthorisedError };
