import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from './db.js';

export { HttpError };

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

export function methodGuard(allowed: string[], handler: Handler) {
  return async (req: VercelRequest, res: VercelResponse) => {
    if (!allowed.includes(req.method || 'GET')) {
      return sendError(res, new HttpError(405, `Method ${req.method} not allowed. Use ${allowed.join(', ')}.`));
    }
    try {
      const result = await handler(req, res);
      if (res.writableEnded) return undefined;
      return sendJson(res, 200, result === undefined ? { ok: true } : result);
    } catch (error) {
      return sendError(res, error);
    }
  };
}

export function sendJson(res: VercelResponse, status: number, payload: unknown) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.json(payload);
}

export function sendError(res: VercelResponse, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  const message =
    error instanceof HttpError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Unexpected server error.';

  if (status >= 500) {
    console.error('[kairos-api]', error);
  }

  return sendJson(res, status, {
    error: message,
    // Lets the sign-in form reveal its code field. Only ever set by
    // TokenRequiredError, and it says nothing about whether the account exists.
    ...(typeof (error as any)?.needsToken === 'boolean' ? { needsToken: (error as any).needsToken } : {}),
    ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
  });
}

/** Parses a JSON request body, tolerating string payloads. */
export async function readJson<T = any>(req: VercelRequest): Promise<T> {
  const raw = (req as any).body;
  if (!raw) return {} as T;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new HttpError(400, 'Request body is not valid JSON.');
    }
  }
  return raw as T;
}

export function requireString(value: unknown, field: string, { max = 2000, required = true } = {}): string {
  const text = String(value ?? '').trim();
  if (!text) {
    if (required) throw new HttpError(400, `"${field}" is required.`);
    return '';
  }
  if (text.length > max) throw new HttpError(400, `"${field}" exceeds ${max} characters.`);
  return text;
}

export function optionalString(value: unknown, max = 20000): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

/** Coerces a value into a `string[]` for TEXT[] columns. */
export function toTextArray(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  const text = String(value).trim();
  if (!text) return [];
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((entry) => String(entry).trim()).filter(Boolean);
    } catch {
      /* fall through to comma split */
    }
  }
  // Handle PostgreSQL array literals like {item1,item2} or {"NGNEERED PROJECTS"}
  if (text.startsWith('{') && text.endsWith('}')) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    const tokens = inner.match(/("(?:\\.|[^"\\])*"|[^,]+)/g) || [];
    return tokens.map((token) => token.replace(/^"|"$/g, '').trim()).filter(Boolean);
  }
  return text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Converts any array/string into a PostgreSQL array literal string: '{"item1","item2"}' or '{}'.
 * Guarantees correct deserialization in PostgreSQL regardless of driver encoding.
 */
export function toPgArray(value: unknown): string {
  const items = toTextArray(value);
  if (!items.length) return '{}';
  const escaped = items.map((item) => `"${String(item).replace(/["\\]/g, '\\$&')}"`);
  return `{${escaped.join(',')}}`;
}

/** Accepts Date | ISO string | '' and returns YYYY-MM-DD or null. */
export function toDateOnly(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function toTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1' || value === 'yes') return true;
  if (value === 'false' || value === 0 || value === '0' || value === 'no') return false;
  return fallback;
}

/** Postgres text[] arrives as a JS array; make sure it always is. */
export function fromTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((entry) => entry.replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  return [];
}

export const isValidEmail = (value: unknown): boolean =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
