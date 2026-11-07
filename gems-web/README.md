# GEMS

GEMS — the **Global Engagement Measurement System** — is the Konstructum group's
instrument for government and regulator engagement. It logs interactions with
named stakeholders, scores them, tracks compliance obligations, and manages the
actions that follow.

This repository is a 1:1 port of the original SharePoint Framework web part
(`gems.sppkg`) to Vercel, and it is the **sibling of KAIROS**. Live at
<https://konstructum-gems.vercel.app>.

## How GEMS and KAIROS relate

The two products were conjoined from the start and must never become two
separate copies of the same organisation. So:

| Concern            | Shared with KAIROS? | Why |
| ------------------ | ------------------- | --- |
| Database           | **Yes** — one Neon database | One registry, one source of truth |
| Accounts           | **Yes** — the same `users` table | One sign-in works in both |
| Contact registry   | **Yes** — the same `clients` table | A stakeholder *is* a contact |
| Company registry   | **Yes** — the same `companies` table | An agency *is* a company |
| Domain policy      | **Yes** — the same four approved domains | |
| Session secret     | **No** — generated separately | A GEMS token cannot be replayed against KAIROS |
| Deployment         | **No** — separate Vercel project | Independent deploys and rollback |

A contact added in KAIROS at NNPC is a GEMS stakeholder immediately. There is no
sync job, because there is nothing to sync.

## The eight agencies

GEMS is deliberately narrow. It only covers:

`NUPRC` · `NUIMS` · `NCDMB` · `NEPL` · `NNPC` · `NIMASA` · `ENSERV` · `NMDPRA`

Anyone whose company does not resolve to one of those is invisible to GEMS.

**This is enforced in SQL, not in the browser.** The original applied the filter
client-side, which meant the SharePoint REST API still returned every row and the
restriction was cosmetic. Here it is a predicate in `api/_lib/gemsScope.ts`, so
out-of-scope contacts are never sent to the client and cannot be reached by
editing a request. Two further consequences worth stating plainly:

- An interaction cannot be attached to an out-of-scope contact, even by passing
  its id directly.
- The application exposes no unfiltered contact-list route, so there is nothing
  for the browser to fall back to.

## What GEMS owns

Four tables, alongside the shared ones:

| Table               | Purpose |
| ------------------- | ------- |
| `gems_interactions` | The core log: stakeholder, agency, category, points, follow-up |
| `gems_compliance`   | Permits, licences, obligations, filings, with expiry tracking |
| `gems_actions`      | Follow-ups and tasks arising from any GEMS entity |
| `gems_audit_log`    | Append-only trail; there is no update or delete route on purpose |

`GET /api/health` reports row counts for all of them, so a misconfigured deploy
says so rather than failing obscurely.

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev
```

| Script                   | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `npm run dev`            | Vite dev server                                      |
| `npm run build`          | Typecheck then production build                      |
| `npm run db:push`        | Apply the shared and GEMS schemas (idempotent)       |
| `npm test`               | Full API suite against a throwaway Postgres          |
| `npm run verify:production` | Check the deployed site, including the agency scope |
| `npm run scope:report`   | How much of the shared registry is in GEMS scope     |

## Environment

| Variable                 | Required | Purpose                                        |
| ------------------------ | -------- | ---------------------------------------------- |
| `DATABASE_URL`           | yes      | The shared Neon connection string               |
| `SESSION_SECRET`         | yes      | Signs session JWTs; 32+ random characters       |
| `BLOB_READ_WRITE_TOKEN`  | for files| Vercel Blob; GEMS files live under `gems/`      |
| `PERMISSIONS_MODE`       | no       | `enforce` (default) or `open`                   |
| `GEMINI_API_KEY`         | for AI   | Server-side AIROS access                        |
| `GEMINI_MODEL`           | no       | Defaults to `gemini-2.0-flash`                  |

Never put a secret in a `VITE_*` variable — anything prefixed that way is inlined
into the browser bundle and is public.

## Layout

```
api/
  handler.ts        the single deployed serverless function
  _routes.ts        route table; dispatches by path to everything below
  _routes/          one module per endpoint (not deployed individually)
  _lib/gemsScope.ts the eight-agency rule, as a SQL predicate
  _lib/gemsMappers.ts  SharePoint-shaped output, as the UI expects
db/
  schema.sql        the shared schema (KAIROS's tables)
  gems-schema.sql   the four GEMS tables
src/
  webparts/kriPlatform/components/   the ported React application
  webparts/kriPlatform/services/gemsApi.ts  fetch-based replacement for the
                                          SharePoint list layer
```

### Three constraints worth knowing about

**One function, not many.** Vercel's Hobby plan allows at most 12 serverless
functions per deployment. The handlers live in `api/_routes/`, which Vercel
ignores, and `api/handler.ts` dispatches to them by path. `vercel.json` rewrites
`/api/:path*` to that one function.

**Relative imports in `api/` must be fully specified.** Vercel transpiles the
TypeScript in `api/` file by file and runs it as native ESM; it does not bundle.
Node's ESM resolver does no guessing, so `./_lib/gemsScope` and the `./_routes`
directory are both invalid. Every relative import under `api/` carries an
explicit `.js` extension, which TypeScript resolves back to the `.ts` source
because `moduleResolution` is `bundler`.

**Module-load failures are invisible.** Both of the above fail *before* the
handler function exists, surfacing as an opaque `FUNCTION_INVOCATION_FAILED`.
`api/handler.ts` therefore imports the router dynamically inside its
`try`/`catch`, which turns an uncatchable cold-start crash into a reportable one.

## Testing

`npm test` truncates the target database, so it must be pointed at a throwaway —
it refuses to run against a hosted URL.

```bash
docker run -d --name kairos-test-db -p 55555:5432 \
  -e POSTGRES_PASSWORD=kairos -e POSTGRES_DB=kairos postgres:16

npm test
```

86 checks covering identity, the shared registry, the agency boundary,
interactions, compliance, actions, the audit trail, the dashboard summary and
scope normalisation. The agency tests are the important ones: they assert that
out-of-scope companies are excluded and that a lookalike name is handled the way
the original's `normalizeGemsAgency` handled it.

## Deployment notes

- Vercel CLI commands on this project need `--scope konstructum1`.
- `scripts/share-with-kairos.mjs` copies the shared configuration from the KAIROS
  project, generating a fresh `SESSION_SECRET` rather than copying one. It takes
  the database URL from `NEON_DATABASE_URL` and refuses a localhost value,
  because KAIROS's `.env.local` deliberately points at the throwaway test
  database.
