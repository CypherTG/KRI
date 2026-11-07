/**
 * KAIROS runtime context.
 *
 * In the SharePoint build every service and component received a
 * `WebPartContext` and read the signed-in user off it:
 *
 *     context.pageContext.user.displayName
 *     context.pageContext.user.email
 *     context.pageContext.user.loginName
 *     context.pageContext.web.absoluteUrl
 *
 * `KriContext` reproduces that surface exactly, backed by a session cookie
 * instead of a SharePoint page token. That means every ported component keeps
 * reading `context.pageContext.user.email` with no edits at all.
 */

export interface KriSessionUser {
  id: string;
  email: string;
  displayName: string;
  title: string;
  jobTitle: string;
  department: string;
  profilePhoto: string;
  isAdmin: boolean;
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
      id: string;
    };
    web: {
      absoluteUrl: string;
    };
  };
}

export function buildContext(user: KriSessionUser, origin?: string): KriContext {
  const resolvedOrigin =
    origin || (typeof window !== 'undefined' ? window.location.origin : '');

  return {
    session: user,
    origin: resolvedOrigin,
    pageContext: {
      user: {
        displayName: user.displayName,
        email: user.email,
        loginName: user.email,
        isAdmin: user.isAdmin,
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

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error;
    throw new ApiError(0, 'Could not reach the KAIROS server. Check your connection and try again.');
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

  if (!response.ok) {
    if (response.status === 401) {
      announceUnauthorised();
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
