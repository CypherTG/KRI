# KRI Platform — Developer Reference

KRI Platform is a SharePoint-native client relationship and engagement workspace built with SPFx, React, and MUI. It runs as a web part inside SharePoint and uses SharePoint Lists and Document Libraries as the system of record.

This document is the developer-facing companion to the in-app Help page. It is intentionally technical and references implementation details in the codebase.

---

## Product Summary

The platform supports:

- Contact registry management (Knowledge → Rapport → Intimacy progression)
- Company-first onboarding flow with company page acumen documents
- Engagement/pipeline management
- Live dashboard analytics and team leaderboard
- AI-powered assistant (AIROS) with full CRM data access
- Communications logging and history
- Biodata editor with profile photo upload
- Automation rules and reminders
- Per-user settings and personalization

---

## Core Architecture

Main stack:

- SPFx 1.18.2
- React 17
- MUI 5
- React Router v6 (HashRouter)
- Zustand for app-wide state

Key entry points:

- [App.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/App.tsx)
- [AppShell.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/layout/AppShell.tsx)
- [graphApi.ts](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/services/graphApi.ts)
- [sharepointProvisioning.ts](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/services/sharepointProvisioning.ts)
- [useStore.ts](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/store/useStore.ts)

---

## Route Map

Defined in [App.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/App.tsx):

- `/dashboard` → team dashboard
- `/clients` → contact list (company view + client view)
- `/clients/:id` → client detail view
- `/companies/:key` → company detail page
- `/pipeline` → engagement board
- `/automations` → automation manager
- `/profile` → personal profile
- `/help` → user manual
- `/settings` → app settings

Additional:

- `/` redirects to the stored home route
- `/add-contact` redirects to `/clients` (deprecated — onboarding now starts from company page)

---

## SharePoint Data Model

### Lists

| List | Purpose |
|---|---|
| `KRI_Clients` | Master contact registry. Stage, ownership, and `PhotoUrl` (text, mirrors biodata photo for app-wide avatar display) |
| `KRI_Communications` | Logged interactions |
| `KRI_Engagements` | Pipeline items and deal records |
| `KRI_StageHistory` | Audit trail for KRI stage transitions |
| `KRI_Automations` | Reminder and scheduled message definitions |
| `KRI_Users` | People registry: families, role context, `ProfilePhoto` (text URL) |
| `KRI_Companies` | Canonical company registry used by company page |
| `KRI_Projects` | Searchable project lookup |
| `KRI_JobTitles` | Deduplicated job title lookup |
| `KRI_CompanyAcumen` | One metadata record per company (filename, uploader, date) |
| `KRI_Biodata` | Extended contact record with photo attachment support and `profile_photo_url` field |

### Document Library

| Library | Purpose |
|---|---|
| `KRI_AcumenFiles` | Company acumen documents, organized as `KRI_AcumenFiles/{companyKey}/{filename}`. Auto-created on first upload. |

---

## Photo Pipeline

### KRI_Users (team leaderboard, shell avatar)

1. `KRI_Users.ProfilePhoto` = text column storing the photo URL
2. `normalizeUser()` in `graphApi.ts` reads `ProfilePhoto`
3. Leaderboard uses `user.ProfilePhoto || buildFallbackUserPhotoUrl(...)` as avatar source
4. Shell calls `getCurrentUserPhotoUrl()` which resolves from SharePoint/Graph

### KRI_Clients (client contact photos)

1. User uploads photo via the Biodata tab in ClientDetail
2. `saveBiodataPhotoAttachment()` in `sharepointProvisioning.ts`:
   - Uploads file as attachment to `KRI_Biodata` list item
   - Writes server-relative URL to `KRI_Biodata.profile_photo_url`
   - **Also mirrors the URL to `KRI_Clients.PhotoUrl`** (surgical write-back — this is the key to app-wide propagation)
3. `normalizeClient()` spreads `...item` so `PhotoUrl` is automatically included when `getClients()` reads `KRI_Clients`
4. `ClientList` table row Avatar and `ClientCard` Avatar both use `src={client.PhotoUrl || undefined}`
5. `ClientDetail` sidebar Avatar uses `src={biodata?.profile_photo_url || ''}`

> **Important**: `KRI_Clients` must have a `PhotoUrl` column (Single line of text) for this to work. This was added manually on 2026-04-30.

---

## Data Layer

Main data access: [graphApi.ts](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/services/graphApi.ts)

Key functions:

- `getClients()` — reads `KRI_Clients`, normalizes via `normalizeClient()` which spreads all fields including `PhotoUrl`
- `getKRIUsers()` — reads `KRI_Users`, normalizes via `normalizeUser()` which explicitly maps `ProfilePhoto`
- `getCurrentUserPhotoUrl()` — resolves current user's photo from SharePoint/Graph
- `resolveSharePointUserPhotoDataUrl()` — resolves a user object's photo as a data URL (used in leaderboard)
- `buildFallbackUserPhotoUrl()` — generates `userphoto.aspx` fallback URL
- `seedKRIUsersFromSharePointIdentity()` — reconcile-not-append registry reseed
- `isManagementAdminUser()` — role check

### Provisioning Layer

[sharepointProvisioning.ts](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/services/sharepointProvisioning.ts)

Key functions:

- `saveClientBiodataRecord()` — creates/updates `KRI_Biodata` record, then calls `saveBiodataPhotoAttachment()` if a photo file is present
- `saveBiodataPhotoAttachment()` — uploads photo, writes `profile_photo_url` to `KRI_Biodata`, and mirrors `PhotoUrl` to `KRI_Clients`
- `saveCompanyAcumenFile()` — deletes old metadata rows, uploads file to `KRI_AcumenFiles/{key}/`, creates fresh metadata row in `KRI_CompanyAcumen`
- `ensureDocumentLibrary()` — auto-creates `KRI_AcumenFiles` doc library (BaseTemplate 101) if missing
- `uploadToDocLib()` — uploads a file under a company subfolder in the doc library
- `getCompanyAcumenRecords()` — derives file URL at read time: `{webUrl}/KRI_AcumenFiles/{companyKey}/{fileName}`

---

## AIROS — AI Assistant

Implemented in [AirosAssistant.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/shared/AirosAssistant.tsx)

- Floating button fixed at bottom-right of every page via AppShell
- Powered by Google Gemini (low-latency, no extended thinking)
- Has full read access to all SharePoint lists via `airosApi.ts`
- Read-only by design — cannot create or modify records
- Supports markdown responses (tables, lists, code blocks)
- Session-scoped conversation history (resets on page refresh)

AIROS tool set includes:
- `search_contacts` — search `KRI_Clients` by name, company, stage
- `get_company_contacts` — all contacts for a given company
- `get_communications` — communication logs for a client
- `get_pipeline` — engagements by stage and owner
- `get_stage_history` — KRI stage change audit trail
- `get_users` — team registry from `KRI_Users`
- `get_company_acumen` — company acumen metadata

---

## Dashboard

[TeamDashboard.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/dashboard/TeamDashboard.tsx)

Key behaviors:

- KPI cards derive values from live Zustand store (populated from SharePoint on mount)
- Activity chart shows monthly communication counts — clicking a bar filters the whole dashboard
- Groups Leaderboard: click a user to reveal their stats panel (Contacts, Won Deals, Comms, Stages). Clicking the same user again hides it. No user is auto-selected on load.
- Family filter chips slice the leaderboard by `normalizeFamily(user.Department)` → Konstructum / PMT7 Integrated / Interkonstruct
- Leaderboard score formula: `contacts×4 + comms×1.5 + deals×3 + wins×8 + stageChanges×2 + targetScore`
- Avatar photos are resolved lazily in batches of 5 and cached in `localStorage` to avoid render loops

---

## Company Acumen

[CompanyDetail.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/CompanyDetail.tsx)

- Upload button stores file to `KRI_AcumenFiles/{companyKey}/` document library (auto-created)
- Each upload: deletes all old `KRI_CompanyAcumen` metadata rows for that company, then creates a fresh row
- Viewer: PDFs/images open inline in iframe dialog; Office docs (Word/Excel/PPT) open in a new tab via SharePoint Online (Word Online etc.)
- File URL derived at runtime: `{webUrl}/KRI_AcumenFiles/{companyKey}/{fileName}` — not stored in metadata

---

## Company Onboarding Flow

[ClientList.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/ClientList.tsx)

- "Add New Company" button (red, top of list) opens the company picker dialog
- Dialog supports freeSolo input — type any new company name
- On confirm: navigates to `/companies/{key}` with `state: { companyName, openAddClient: true }`
- CompanyDetail auto-opens the client form when `openAddClient: true` in navigation state
- CompanyDetail creates the company registry record via `upsertCompanyRegistryRecord()` on mount

This means: **creating a new company and adding the first client is a single flow** — no separate "create company" step needed in SharePoint.

---

## Contact List & Client Detail

[ClientList.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/ClientList.tsx) / [ClientDetail.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/ClientDetail.tsx)

- Client view (table/grid) and Company view are toggled at the top
- Table rows and grid cards both display `client.PhotoUrl` as the avatar `src`
- ClientDetail sidebar avatar uses `biodata.profile_photo_url`
- Biodata tab contains the photo upload control and all extended personal fields
- Stage progression (Knowledge → Rapport → Intimacy) is managed from the detail sidebar

---

## Biodata

[ClientBiodata.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/ClientBiodata.tsx)

- Clickable avatar for photo upload
- Searchable pickers: 36 Nigerian states + FCT, major Nigerian languages, religions
- Saves to `KRI_Biodata` list
- Photo attachment stored under `KRI_Biodata` item, URL mirrored to `KRI_Clients.PhotoUrl`

---

## Settings

[SettingsPage.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/settings/SettingsPage.tsx)

- Light/dark theme toggle (VS Code-style dark palette)
- Default landing page selection
- User registry reconciliation (reseed) — deduplicates, updates, does not blindly append
- Per-user preferences stored in SharePoint preferences list

---

## Shell and Navigation

[AppShell.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/layout/AppShell.tsx)

- Left sidebar navigation
- Top search bar (global, live results)
- Top-right notification and profile controls
- Bottom-left user strip with avatar
- AIROS floating button (bottom-right)
- Shell resolves current user photo via `getCurrentUserPhotoUrl()` on mount

---

## Build and Deployment

```
cd kri-platform
node_modules\.bin\gulp clean
node_modules\.bin\gulp build
node_modules\.bin\gulp bundle --ship
node_modules\.bin\gulp package-solution --ship
```

Deploy the `.sppkg` from `sharepoint/solution/` to the SharePoint App Catalog.

Node version caveat: Node 24 is above the SPFx-supported range but works with the `Bypassing Node version check` warning.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| 400 on acumen MERGE | Corrupted list item — the new flow deletes and recreates, so this is fixed |
| Avatar not showing after biodata upload | `KRI_Clients.PhotoUrl` column missing — must be Single line of text |
| Leaderboard photos missing | User has no `ProfilePhoto` in `KRI_Users` — run registry reseed |
| Doc library 404 | `KRI_AcumenFiles` not yet created — first upload triggers auto-creation |
| AIROS not responding | Check `system_prompt.js` for Gemini API key configuration |

---

## Source Reference Index

- [App.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/App.tsx)
- [AppShell.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/layout/AppShell.tsx)
- [TeamDashboard.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/dashboard/TeamDashboard.tsx)
- [ClientList.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/ClientList.tsx)
- [ClientDetail.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/ClientDetail.tsx)
- [ClientCard.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/ClientCard.tsx)
- [ClientBiodata.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/ClientBiodata.tsx)
- [CompanyDetail.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/clients/CompanyDetail.tsx)
- [PipelineBoard.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/engagements/PipelineBoard.tsx)
- [AutomationManager.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/automations/AutomationManager.tsx)
- [UserProfile.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/profile/UserProfile.tsx)
- [SettingsPage.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/settings/SettingsPage.tsx)
- [HelpCenter.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/shared/HelpCenter.tsx)
- [AirosAssistant.tsx](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/components/shared/AirosAssistant.tsx)
- [graphApi.ts](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/services/graphApi.ts)
- [sharepointProvisioning.ts](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/services/sharepointProvisioning.ts)
- [useStore.ts](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/store/useStore.ts)
- [theme.ts](C:/Aegis/KRI/kri-platform/src/webparts/kriPlatform/theme/theme.ts)
