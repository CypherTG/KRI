# GEMS Tasks

## Phase 1: GEMS Component Rebranding

### 1.1 Rename KAIROS Clone Components
- [ ] Create `components/stakeholders/GemsStakeholderList.tsx`
  - Port of `ClientList.tsx` with GEMS-specific: defaults to `clients` mode, uses `readonly`, removes KAIROS-specific actions
- [ ] Create `components/stakeholders/GemsStakeholderDetail.tsx`
  - Port of `ClientDetail.tsx` with GEMS: defaults to `readonly`, shows GEMS interaction workspace, gov stakeholder semantics
- [ ] Create `components/agencies/GemsAgencyList.tsx`
  - Port of `ClientList.tsx` in `companies` mode — agency/regulator registry view
- [ ] Create `components/agencies/GemsAgencyDetail.tsx`
  - Port of `CompanyDetail.tsx` — agency profile with acumen upload, stakeholder roster
- [ ] Create `components/dashboard/GemsDashboard.tsx`
  - Port of `TeamDashboard.tsx` — GEMS-specific KPIs, gov stakeholder focus, no KAIROS metrics
- [ ] Create `components/settings/GemsSettings.tsx`
  - Port of `SettingsPage.tsx` — GEMS workspace preferences

### 1.2 Update App.tsx Routing
- [ ] Replace KAIROS imports with GEMS component imports
- [ ] Add `/gems/` prefixed routes:
  ```
  /gems/dashboard
  /gems/stakeholders
  /gems/stakeholders/:id
  /gems/agencies
  /gems/agencies/:agencyKey
  /gems/profile
  /gems/help
  /gems/settings
  ```
- [ ] Keep backward-compatible flat routes redirecting to /gems/

### 1.3 Update GemsShell.tsx Navigation
- [ ] Update PRIMARY_NAV items:
  - Dashboard → /gems/dashboard
  - Stakeholders → /gems/stakeholders
  - Agencies → /gems/agencies
  - My Profile → /gems/profile
- [ ] Update route labels and summaries for new paths
- [ ] Add notification badge placeholder
- [ ] Update operating principle card text

### 1.4 GEMS Service Layer
- [x] Create `services/gemsGraphApi.ts` — wraps graphApi + sharepointProvisioning with GEMS-specific queries
- [x] Create `store/gemsStore.ts` — in-memory GEMS computed views over shared KAIROS data

---

## Phase 2: GEMS Feature Enhancement

### 2.1 Engagement Workspace Enhancement
- [ ] Add engagement types: Meeting, Site Visit, Public Hearing, Regulatory Filing, Call, Informal Meeting
- [ ] Add formal agenda builder
- [ ] Add minutes editor with action item extraction
- [ ] Add attendee management (internal/external, RSVP tracking)
- [ ] Add status workflow: Draft → Scheduled → Confirmed → In Progress → Completed → Follow-up Required
- [ ] Add calendar integration (month/week/day toggle)
- [ ] Add meeting templates for recurring patterns

### 2.2 Regulatory Compliance Module
- [ ] Create SharePoint list `GEMS_Compliance` in sharepointProvisioning.ts
- [ ] Create `components/compliance/ComplianceDashboard.tsx`
  - Health score, upcoming deadlines, overdue items
- [ ] Create `components/compliance/PermitLicenseTracker.tsx`
  - Track permits/licenses with expiry, renewal alerts
  - Color-coded status: active, expiring-soon, expired, pending-renewal
- [ ] Create `components/compliance/ObligationRegistry.tsx`
  - Log obligations with agency, regulation, due date, owner, status
- [ ] Create `components/compliance/ComplianceCalendar.tsx`
  - Timeline merging obligations, permits, filing deadlines

### 2.3 Government Opportunity Pipeline
- [ ] Create SharePoint list `GEMS_Opportunities` in sharepointProvisioning.ts
- [ ] Create `components/opportunities/OpportunityPipeline.tsx`
  - Kanban stages: Identified → Assessing → Preparing → Submitted → Shortlisted → Awarded → Lost
- [ ] Create `components/opportunities/OpportunityDetail.tsx`
  - Issuing agency, value, deadline, probability, lead contact
  - Linked stakeholders, engagements, documents

### 2.4 Executive Dashboard Enhancement
- [ ] Add engagement activity chart (by type/month)
- [ ] Add stakeholder coverage map
- [ ] Add compliance health gauge
- [ ] Add pipeline value funnel
- [ ] Add relationship health trend lines
- [ ] Role-based views: Executive (summary), Manager (drill-down), Team Member (personal queue)

---

## Phase 3: Intelligence & Automation

### 3.1 Regulatory Intelligence Repository
- [ ] Create document library with tagging (jurisdiction, agency, topic)
- [ ] Add Airos-powered AI summaries
- [ ] Add regulatory change alerts

### 3.2 Relationship Scoring Engine
- [ ] Create `utils/scoringEngine.ts` with multi-factor scoring
- [ ] Create relationship health widget with trend visualization
- [ ] Add score decay and threshold alerts

### 3.3 Notifications & Alerts
- [ ] Create `components/notifications/NotificationCenter.tsx`
- [ ] Create `utils/notificationService.ts`
- [ ] Integrate badge count in GemsShell

### 3.4 Audit Trail
- [ ] Integrate audit logging into GEMS CRUD operations
- [ ] Create admin audit log viewer

### 3.5 Global Search
- [ ] Create `components/search/GlobalSearch.tsx`
- [ ] Search across all GEMS entity types
- [ ] Keyboard shortcut (Ctrl+K)

---

## Phase 4: Advanced Features

### 4.1 Role-Based Access Control
- [ ] Create `utils/gemsRBAC.ts` with permission matrix
- [ ] Create permission guard component
- [ ] Add approval workflows

### 4.2 Document Management Enhancement
- [ ] Gov-specific document categories
- [ ] Version tracking, template library
- [ ] Metadata classification

### 4.3 Data Import/Export
- [ ] Import stakeholders from CSV/Excel
- [ ] Export reports to PDF/Excel/CSV

### 4.4 Reporting & Analytics
- [ ] Pre-built report templates
- [ ] Scheduled report generation
- [ ] Visual analytics dashboard

---

## Phase 5: Cleanup

### 5.1 Import Path Audit
- [ ] Scan all GEMS files for cross-KAIROS imports
- [ ] Replace with local GEMS imports

### 5.2 Naming Consistency
- [ ] Verify all components prefixed `Gems`
- [ ] Consistent file naming convention

### 5.3 Dead Code Removal
- [ ] Remove unused KAIROS clones from GEMS directory
- [ ] Remove orphan imports
