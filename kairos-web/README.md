# KAIROS

KAIROS is the Konstructum group intranet: a relationship-intelligence tool for
capturing, scoring and advancing business contacts through the KRI model
(Knowledge → Rapport → Intimacy).

This repository is a 1:1 port of the original SharePoint Framework web part
(`kairos.sppkg`) to a modern, self-hosted stack:

| Concern            | SharePoint (original)      | KAIROS (this port)              |
| ------------------ | -------------------------- | ------------------------------- |
| Hosting            | SharePoint Online          | Vercel                          |
| Database           | SharePoint lists           | PostgreSQL on Neon              |
| Authentication     | SharePoint / Microsoft 365 | Email + password, JWT cookie    |
| File attachments    | SharePoint document library | Vercel Blob                    |
| AI assistant       | Gemini called from browser | Gemini called from the server   |
| Frontend           | SPFx + React 17            | Vite + React 17 (unchanged)     |

The React components, MUI theme and data shapes are carried over essentially
unchanged. API responses keep the original SharePoint-style PascalCase field
names (`ID`, `Title`, `FirstName`, `KRIStage`, …) so the UI code is a faithful
copy rather than a rewrite.

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev
```

| Script                  | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Vite dev server                                      |
| `npm run build`         | Typecheck then production build                      |
| `npm run typecheck`     | Types only                                           |
| `npm run db:push`       | Apply `db/schema.sql` (idempotent)                   |
| `npm run db:seed`       | Apply the schema and create the founding admin       |
| `npm test`              | Full API suite against a throwaway Postgres          |
| `npm run verify:health` | Check the deployed site                              |
| `npm run verify:auth`   | Sign in end to end against the deployed site         |

## Environment

| Variable                 | Required | Purpose                                        |
| ------------------------ | -------- | ---------------------------------------------- |
| `DATABASE_URL`           | yes      | Neon connection string                         |
| `SESSION_SECRET`         | yes      | Signs session JWTs; a 32+ character random value |
| `GEMINI_API_KEY`         | for AI   | Server-side AIROS access                       |
| `BLOB_READ_WRITE_TOKEN`  | for files| Vercel Blob uploads                            |
| `ADMIN_EMAILS`           | no       | Extra pinned admin emails, comma separated     |
| `PERMISSIONS_MODE`       | no       | `enforce` (default) or `open`                  |
| `GEMINI_MODEL`           | no       | Defaults to `gemini-2.0-flash`                 |
| `ALLOWED_EMAIL_DOMAINS`  | no       | Extra permitted email domains, comma separated |

### Permitted email domains

KAIROS is a company intranet, so an account may only exist on one of these
domains:

- `@konstructum.com`
- `@pmt7integrated.com`
- `@interkonstruct.com`
- `@ngneeredprojects.com`

The list is enforced on registration, on sign-in, and when an administrator
creates an account directly, so it cannot be sidestepped through the admin UI.
`ALLOWED_EMAIL_DOMAINS` can **add** domains but never remove them — the four
above are hardcoded, so a stray environment variable cannot quietly open the
system up.

The pinned administrators (by default `onechief011@gmail.com`) are the sole
exception, which is what allows the founding administrator to exist on a
personal mailbox.

Sign-in rejects a non-permitted address with the same 403 and the same message
whether or not the account exists and whatever password was supplied, so the
response cannot be used to discover who has an account.

Never put `GEMINI_API_KEY` or any other secret in `VITE_*` variables — anything
prefixed that way is inlined into the browser bundle and is public.

## Layout

```
api/
  handler.ts        the single deployed serverless function
  _routes.ts        route table; dispatches by path to everything below
  _routes/          one module per endpoint (not deployed individually)
  _lib/             auth, db, scoping, blob, mappers, AIROS
db/
  schema.sql        12 tables, idempotent
  seed.sql          founding administrator
src/                the React application (ported from the web part)
scripts/            schema, test and deployment verification tooling
```

### Two constraints worth knowing about

**One function, not nineteen.** Vercel's Hobby plan allows at most 12 serverless
functions per deployment and KAIROS exposes 19 endpoints. The handlers therefore
live in `api/_routes/`, which Vercel ignores, and `api/handler.ts` dispatches
to them by path. `vercel.json` rewrites `/api/:path*` to that one function.

**Relative imports in `api/` must be fully specified.** Vercel transpiles the
TypeScript in `api/` file by file and runs the result as native ESM; it does not
bundle. Node's ESM resolver does no extension guessing, so `./_lib/http` and the
`./_routes` directory are both invalid — the latter fails outright as an
unsupported directory import. Every relative import under `api/` therefore
carries an explicit `.js` extension, which TypeScript resolves back to the `.ts`
source because `moduleResolution` is `bundler`.

Both of these fail at *module load*, before the handler function exists, so they
surface as an opaque `FUNCTION_INVOCATION_FAILED` with no useful message. For
that reason `api/handler.ts` imports the router dynamically inside its
`try`/`catch`: it turns an uncatchable cold-start crash into a reportable error.
`GET /api/health` reports which configuration is present — booleans only, never
values — and whether the database answers, without requiring a sign-in.

## Permissions

Default is `PERMISSIONS_MODE=enforce`:

- administrators see everything;
- everyone else sees the contacts they own, plus contacts shared with them
  through an approved access request;
- shared contacts are **read-only**, so approving access never grants edit rights.

Set `PERMISSIONS_MODE=open` to reproduce the original web part's behaviour, where
every signed-in user saw and edited the entire list.

## Testing

`npm test` truncates the target database and runs the full suite against it, so
point `DATABASE_URL` at a throwaway Postgres, never at Neon or production.

```bash
docker run -d --name kairos-test-db -p 55555:5432 \
  -e POSTGRES_PASSWORD=kairos -e POSTGRES_DB=kairos postgres:16

set "DATABASE_URL=postgres://postgres:kairos@127.0.0.1:55555/kairos"
npx tsx scripts/smoke.ts
```

The suite covers routing, authentication, ownership, read-only sharing, stage
history, CRUD, admin management and import.

## Deployment notes

- Vercel CLI commands on this project need `--scope konstructum1`.
- The production domain is `konstructum-kairos.vercel.app`.
- `GET /api/health` returns 503 until every required variable is present; that
  is the quickest way to confirm a deployment is fully configured.
- The original web part contained a committed Gemini API key. It should be
  revoked, since it is in the history of the old repository.
