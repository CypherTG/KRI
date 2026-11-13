import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;

/**
 * Postgres client.
 *
 * Uses postgres.js rather than the Neon-specific driver on purpose: Neon is
 * the target, but postgres.js speaks plain Postgres, so the exact same code
 * also runs against a local database during development and against the
 * throwaway Postgres used by the smoke test. One code path, no branching.
 *
 * Inside a Vercel function the default Node runtime allows TCP, so a plain
 * pooled connection is fine. `max: 1` keeps each warm function to a single
 * connection, which is what serverless concurrency actually needs.
 */
export function getDb(): Sql {
  if (client) return client;
  const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!rawUrl) {
    throw new HttpError(
      500,
      'DATABASE_URL is not configured. Add it to .env.local and to the Vercel project environment variables.',
    );
  }
  const url = rawUrl.replace(/[?&]channel_binding=[^&]+/g, '');
  client = postgres(url, {
    max: 10,
    idle_timeout: 60,
    connect_timeout: 10,
    keep_alive: 30,
    // MUST stay true: `fetch_types: false` skips postgres.js's pg_type
    // bootstrap, so array serializers never register. JS array parameters then
    // serialize via `'' + x` (Array.toString() → "a,b", no braces) and
    // Postgres rejects every one with `malformed array literal`. This broke
    // all text[] writes (business_arms, biodata lists, lookups unnest) and
    // reads (ANY($1::text[])). `prepare: false` is kept for the Neon pooler.
    fetch_types: true,
    backoff: () => 0,
    // Neon and most managed providers terminate TLS with a proxy chain that
    // does not present a cert postgres.js can verify.
    ssl: /neon\.tech|neon\.build|supabase\./i.test(url) ? 'require' : undefined,
    prepare: false,
    // The schema is intentionally idempotent, so "already exists" notices are
    // expected noise rather than anything actionable.
    onnotice: () => {},
  });
  return client;
}

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Runs a SQL statement. Values are ALWAYS passed as bound parameters in the
 * second argument — never interpolated into the SQL string — so dynamically
 * composed statements are safe.
 */
export async function raw<T = any>(text: string, params: any[] = []): Promise<T[]> {
  try {
    const rows = await getDb().unsafe(text, params as any[]);
    return (rows || []) as T[];
  } catch (error) {
    // The statement is logged because a parameter-numbering mistake produces an
    // error like "could not determine data type of parameter $2" that is close to
    // impossible to place without seeing the SQL.
    console.error('[db] query failed', {
      message: error instanceof Error ? error.message : String(error),
      params: params.length,
      sql: text.replace(/\s+/g, ' ').trim().slice(0, 600),
    });
    throw error;
  }
}

/** Same as `raw` but returns at most one row. */
export async function rawOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await raw<T>(text, params);
  return rows.length ? rows[0] : null;
}
