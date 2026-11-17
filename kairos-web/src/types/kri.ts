export interface KriSessionUser {
  id: string;
  email: string;
  displayName: string;
  title: string;
  jobTitle: string;
  department: string;
  profilePhoto: string;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  isActive: boolean;
  targetClients: number;
  targetDeals: number;
}

export interface KriContext {
  session: KriSessionUser;
  /** Absolute origin of the deployment, e.g. https://kairos.vercel.app */
  origin: string;
  pageContext: {
    user: {
      displayName: string;
      email: string;
      loginName: string;
      isAdmin: boolean;
      isSuperAdmin?: boolean;
      id: string;
    };
    web: {
      absoluteUrl: string;
    };
  };
}

const AUTH_TOKEN_STORAGE_KEY = 'kairos.session.token';

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function buildContext(user: KriSessionUser, origin?: string): KriContext {
  const resolvedOrigin =
    origin || (typeof window !== 'undefined' ? window.location.origin : '');
  const isSuperAdmin =
    Boolean(user.isSuperAdmin) || String(user.email || '').trim().toLowerCase() === 'mbello@konstructum.com';

  return {
    session: {
      ...user,
      isSuperAdmin,
      isAdmin: Boolean(user.isAdmin) || isSuperAdmin,
    },
    origin: resolvedOrigin,
    pageContext: {
      user: {
        displayName: user.displayName,
        email: user.email,
        loginName: user.email,
        isAdmin: Boolean(user.isAdmin) || isSuperAdmin,
        isSuperAdmin,
        id: user.id,
      },
      web: {
        absoluteUrl: resolvedOrigin,
      },
    },
  };
}

/** Authenticated fetch wrapper. Every backend call goes through here. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class UnauthorisedError extends ApiError {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(401, message);
    this.name = 'UnauthorisedError';
  }
}

const listeners = new Set<(unauthorised: boolean) => void>();

export function onUnauthorised(listener: (unauthorised: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announceUnauthorised() {
  listeners.forEach((listener) => listener(true));
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = path.startsWith('/api') ? path : `/api${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function apiRequest<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const storedToken = getStoredAuthToken();

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (response.ok && typeof payload?.token === 'string' && payload.token) {
    setStoredAuthToken(payload.token);
  }

  if (!response.ok) {
    if (response.status === 401) {
      if (!path.includes('/auth/login')) {
        setStoredAuthToken(null);
        announceUnauthorised();
      }
      throw new UnauthorisedError(payload?.error || 'Your session has expired. Please sign in again.');
    }
    throw new ApiError(response.status, payload?.error || `Request failed (${response.status}).`);
  }

  return (payload ?? {}) as T;
}

/** Reads a File as a base64 string (without the data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read that file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
