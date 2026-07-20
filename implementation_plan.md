# GEMS Implementation Plan (Updated)

## Architecture Reality

### Data Sources
- **KAIROS SharePoint lists** (read via `graphApi.ts`):
  - `KRI_Clients` — stakeholder registry (GEMS filters to gov agencies via `gemsScope.ts`)
  - `KRI_Communications` — communication history
  - `KRI_Engagements` — pipeline/deal tracking
  - `KRI_Automations` — automated messaging
  - `KRI_Users` — team member registry
  - `KRI_StageHistory` — stage change audit trail
  - `KRI_Companies` — company registry
  - `KRI_Biodata` — client biodata enrichment
  - `KRI_CompanyAcumen` — company document metadata
  - `KRI_AcumenFiles` — document library

- **GEMS-specific list** (managed via `sharepointProvisioning.ts`):
  - `GEMS_Interactions` — interaction records with category scoring (Crown Jewel/Pearl/Coral/Ruby)

### How GEMS Filters Data
- `gemsScope.ts` restricts to clients from: NUPRC, NUIMS, NCDMB, NEPL, NNPC, NIMASA, ENSERV, NMDPRA
- All other KAIROS data (users, comms, engagements) is shared but GEMS shows only gov-relevant views

### Current Architecture
```
KAIROS Lists → graphApi.ts → useStore.ts (shared zustand)
                                     ↓
                              gemsScope.ts filters
                                     ↓
                        GEMS Components (read-only view)
                                     ↓
                     GEMS_Interactions (GEMS-specific scoring)
```

### DON'T
- Create separate GEMS SharePoint lists for stakeholders/agencies/etc.
- Duplicate KAIROS data into GEMS-specific stores/DBs
- Modify KAIROS components or shared services in a way that breaks KAIROS

---

## Phase 1: GEMS Component Rebranding (Current)

### 1.1 Rename KAIROS Clone Components
GEMS components under `components/clients/`, `components/companies/`, `components/dashboard/`, `components/settings/` are copies of KAIROS components used with GEMS-specific props:
- `ClientList.tsx` → `GemsStakeholderList.tsx` (gov stakeholder registry view)
- `ClientDetail.tsx` → `GemsStakeholderDetail.tsx` (stakeholder workspace)
- `CompanyDetail.tsx` → `GemsAgencyDetail.tsx` (agency/regulator profile)
- `ClientList.tsx` (companies mode) → `GemsAgencyList.tsx` (agency registry)
- `TeamDashboard.tsx` → `GemsDashboard.tsx` (GEMS-specific dashboard)
- `SettingsPage.tsx` → `GemsSettings.tsx` (GEMS workspace settings)

### 1.2 Update App.tsx Routing
- Route new GEMS component names
- Add `/gems/` prefix navigation structure
- Keep all existing routes working

### 1.3 Update GemsShell.tsx Navigation
- Update nav items to reflect GEMS-specific module names
- Add notification badge, search bar

### 1.4 Create GEMS Service Layer
- `services/gemsGraphApi.ts` — wraps `graphApi.ts` + `sharepointProvisioning.ts` with GEMS-specific queries
- `store/gemsStore.ts` — in-memory abstraction providing GEMS-specific computed views over shared KAIROS data

---

## Phase 2: GEMS Feature Enhancement

### 2.1 Engagement Workspace (`GemsInteractionWorkspace.tsx`)
**Already has:** Category scoring, leaderboard, monthly targets, agency dashboards, follow-up tracking, roadmap.
**Needs:**
- Formal engagement types beyond Meeting/Call/Email/Note (Site Visit, Public Hearing, Regulatory Filing)
- Agenda builder with time allocations
- Minutes editor with action item extraction
- Attendee management with RSVP tracking
- Status workflow: Draft → Scheduled → Confirmed → In Progress → Completed → Follow-up Required
- Calendar view integration
- Meeting templates for recurring engagements

### 2.2 Regulatory Compliance Module (NEW)
**SharePoint list:** `GEMS_Compliance`
**Components:**
- Permit/License Tracker (expiry dates, renewal alerts)
- Obligation Registry (regulatory requirements, due dates, owners)
- Compliance Dashboard (health score, upcoming deadlines, overdue items)
- Compliance Calendar (timeline view)

### 2.3 Government Opportunity Pipeline (NEW)
**SharePoint list:** `GEMS_Opportunities`
**Components:**
- Pipeline board: Identified → Assessing → Preparing → Submitted → Shortlisted → Awarded → Lost
- Opportunity detail view (issuing agency, value, deadline, probability, lead contact)
- Linked to stakeholders, agencies, and engagements

### 2.4 Executive Dashboard Enhancement
**Current:** Basic per-arm progress bars and agency allocation views.
**Needs:**
- Engagement activity chart (by type, by month, trend)
- Stakeholder coverage map (agencies engaged vs total target)
- Compliance health gauge
- Pipeline value funnel
- Relationship health trend lines
- Role-based views (Executive vs Manager vs Team Member)

---

## Phase 3: Intelligence & Automation

### 3.1 Regulatory Intelligence Repository
**Type:** Document library with AI-powered summaries via Airos
**Contents:** Regulatory documents, policy papers, legislation changes, categorized by jurisdiction/agency/topic

### 3.2 Relationship Scoring Engine
**Enhance `gemsScope.ts` or new utility:**
- Multi-factor scoring: recency, meeting quality, sentiment, responsiveness, regulatory outcomes
- Stakeholder health monitoring with trend visualization
- Alerts for deteriorating relationships

### 3.3 Notifications & Alerts (NEW)
- Deadline approaching, new opportunities, regulatory changes, follow-ups due, compliance expiry
- In-app notification center with read/unread state
- Badge count in GemsShell

### 3.4 Audit Trail (NEW)
- Log all CRUD operations on GEMS entities
- Store in `KRI_StageHistory` (extend) or new `GEMS_AuditLog` list
- Admin audit log viewer

### 3.5 Global Search (NEW)
- Unified search across stakeholders, agencies, engagements, compliance, opportunities
- Powered by SharePoint search API
- Keyboard shortcut (Ctrl+K)

---

## Phase 4: Advanced Features

### 4.1 Role-Based Access Control
- Roles: Orbit Team (admin), Executive (read-only), BD Manager, Team Member, Compliance Officer
- Permission-based rendering and action gating

### 4.2 Document Management
- Gov-specific document categories (Regulatory Filing, Permit, Policy Submission, Meeting Minutes)
- Version tracking, template library, metadata classification

### 4.3 Data Import/Export
- Import: stakeholders from CSV/Excel (already exists via KAIROS)
- Export: compliance reports, engagement summaries, pipeline reviews

### 4.4 Reporting & Analytics
- Pre-built report templates with PDF/Excel export
- Scheduled report generation
- Visual analytics dashboard

---

## Phase 5: Cleanup

### 5.1 Import Path Audit
- Ensure all GEMS files import from local paths, not crossing into KAIROS component directories
- Shared services (graphApi.ts) are the only allowed cross-import

### 5.2 Naming Consistency
- All GEMS components prefixed `Gems`
- Consistent file naming: `Gems<Module><View>.tsx`

### 5.3 Dead Code Removal
- Remove unused KAIROS clones from GEMS directory
- Remove orphan imports

---

## Overarching Rule
**DO NOT TOUCH KAIROS.** All GEMS work stays in `gems/`. GEMS reads KAIROS data through shared services (`graphApi.ts`, `sharepointProvisioning.ts`) but never modifies KAIROS components or creates parallel SharePoint lists without explicit approval.
