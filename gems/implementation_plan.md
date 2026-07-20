# GEMS Implementation Plan

## Purpose

Bring the GEMS software in `C:\Aegis\KRI\gems` into full functional alignment with the requirements captured in `C:\Aegis\KRI\kri-platform\GEMS - Product Brief.pdf`, without modifying the KAIROS codebase.

This plan is intentionally exhaustive. It is designed to be treated as the immutable execution blueprint for the GEMS refactor and feature-completion pass.

## Non-Negotiable Constraints

1. Do not edit any source under `C:\Aegis\KRI\kri-platform`.
2. Treat KAIROS as the upstream data platform and system of record for the stakeholder/contact pool.
3. GEMS must remain a dedicated engagement-management layer on top of the KAIROS KRI data pool, not a parallel registry.
4. Preserve all existing working GEMS functionality unless a change is required to complete the brief.
5. Keep all changes inside `C:\Aegis\KRI\gems`.
6. Every feature added must be validated against real SharePoint data paths and existing app routes.
7. All changes must be reversible in the repository history, but this plan itself is immutable once approved.

## Product Brief Interpretation

The brief describes GEMS as a government engagement management system for stakeholder engagement, regulatory interactions, executive reporting, compliance follow-up, document management, and operational visibility. In practical implementation terms, GEMS is expected to provide:

1. A read/write interaction layer over the canonical KAIROS KRI stakeholder pool.
2. A company/organization workspace that can collect and surface GEMS-specific documents and scoring data.
3. A point-based classification and reporting workflow for engagements.
4. User profile views, leaderboards, dashboards, and operational summaries.
5. Reminder, follow-up, and automation features.
6. Search, filters, and responsive UX that stay usable inside the SharePoint-hosted SPFx shell.
7. Auditability and exportability sufficient for executive reporting.

## Current Architectural Understanding

### Data model and storage

The application currently uses SharePoint lists and libraries through `graphApi.ts` and `sharepointProvisioning.ts`. The design already includes:

1. KRI clients/stakeholders
2. KRI users
3. KRI engagements
4. KRI communications
5. KRI stage history
6. KRI automations
7. KRI biodata
8. KRI company acumen
9. GEMS interactions

This is the correct direction. The missing work is not the existence of the data layer, but completeness, consistency, and feature coverage across the UI and service layer.

### Rendering and shell

The GEMS app is mounted through `components/App.tsx`, wrapped in a theme provider, router, shell, and error boundary. The app already uses:

1. `GemsShell` as the primary GEMS shell
2. `AirosAssistant` as the assistant layer
3. `TeamDashboard` as the operational dashboard
4. `ClientList`, `ClientDetail`, `CompanyDetail`, `GemsUserProfile`, `AutomationManager`, `HelpCenter`, and `SettingsPage`

The main remaining work is completion and hardening, not foundational bootstrapping.

## Requirement Coverage Matrix

### 1. Stakeholder and regulator database

Status: Partial

Current state:
1. Stakeholder/contact registry exists.
2. Company grouping exists.
3. Search and filtering exist.
4. Individual detail pages exist.
5. User lookup and team member registry exist.

Gaps to close:
1. Unified stakeholder/company/regulator mapping model.
2. Clear support for regulators, ministries, agencies, operators, and communities as first-class stakeholder categories.
3. Better relationship metadata, including stakeholder type, influence, jurisdiction, and activity context.
4. Search should surface all relevant stakeholder dimensions, not just the current contact-centric fields.
5. The UI should present the database as the canonical stakeholder registry, not a contacts-only list.

### 2. Engagement planning and scheduling

Status: Partial

Current state:
1. Engagement records exist.
2. Follow-up date exists in some forms.
3. Automations exist for reminders.

Gaps to close:
1. A real planning/scheduling surface is missing.
2. Calendar-style visibility is missing.
3. Engagements should support dates, owners, status transitions, and next actions in a first-class way.
4. Follow-up should be surfaced across dashboard, profile, detail, and automation surfaces.
5. The app should support “planned”, “scheduled”, “completed”, and “overdue” states where applicable.

### 3. Meetings, visits, event minutes, action tracking

Status: Partial

Current state:
1. Meeting logging exists.
2. Engagement notes exist.
3. Communications timeline exists.

Gaps to close:
1. Distinct visit/event/minutes/action-item concepts are not fully modeled.
2. There is no clear action tracking queue or task ownership view.
3. Minutes/notes and outcomes should be separable.
4. Actions should be traceable to the source engagement.

### 4. Task assignment, follow-up, reminders

Status: Partial

Current state:
1. Automation manager exists.
2. Follow-up fields exist in parts of the app.
3. Notifications exist in the shell.

Gaps to close:
1. Action items should be explicit entities or at least explicit records with ownership and due date.
2. Follow-up reminders should be generated from interaction and task metadata.
3. The dashboard should surface overdue follow-ups and upcoming actions.
4. The user profile should show the user’s own open obligations.

### 5. Regulatory obligations, permits, licences, compliance tracking

Status: Partial

Current state:
1. Regulatory language exists in UI/help copy.
2. Document upload for company acumen exists.
3. Engagement scoring and categories exist.

Gaps to close:
1. There is no explicit compliance register or compliance workflow surface.
2. Permits, licences, obligations, and deadlines are not first-class records.
3. Compliance status should be visible in company and dashboard views.
4. The data layer should capture compliance milestones and document references.

### 6. Document management

Status: Partial

Current state:
1. Company acumen upload exists.
2. Document viewer exists.
3. SharePoint-backed document library usage exists.

Gaps to close:
1. Document metadata should support type, category, owner, and validity context.
2. The app should support upload, view, replace, and download flows with clear status.
3. The company workspace should make the canonical document obvious.
4. Search should include document records where possible.

### 7. Executive dashboards and KPI/KRI visibility

Status: Partial

Current state:
1. Dashboard cards and leaderboard exist.
2. Profile metrics exist.
3. Scoring exists.

Gaps to close:
1. Executive summaries should align with GEMS metrics, not only stage counts.
2. Reporting should include compliance, actions, documents, and follow-up visibility.
3. Dashboard should surface the most important operational exceptions.
4. Company and user views should complement one another with drilldowns.

### 8. Real-time reporting and downloadable reports

Status: Partial

Current state:
1. Dashboard export to CSV exists.
2. Live data refresh patterns exist in multiple places.

Gaps to close:
1. A formal reporting/export module is not complete.
2. There should be exports for filtered stakeholder, company, engagement, and automation views.
3. Reporting should be consistent across dashboard, profile, and company pages.

### 9. Relationship scoring and stakeholder health

Status: Mostly implemented

Current state:
1. Relationship stages exist.
2. Engagement scoring exists.
3. User leaderboard exists.

Gaps to close:
1. Stakeholder health should include inactivity and follow-up gaps.
2. Scoring explanations should be visible and auditable.
3. The model should remain aligned with the GEMS brief and not drift into old contact-centric terminology.

### 10. Notifications and alerts

Status: Partial

Current state:
1. Shell notifications exist.
2. Automations exist.

Gaps to close:
1. Alerts should include overdue actions, upcoming deadlines, new assignments, and pending reviews.
2. Notification state should persist or be reconstructable from data rather than only from session memory.

### 11. RBAC and access control

Status: Partial

Current state:
1. Some admin checks exist.
2. Read-only and readonly-related routes exist.

Gaps to close:
1. Clear role-based surfaces are needed for admin, manager, contributor, and read-only roles.
2. UI should hide or disable unsupported actions based on role.
3. Service-level checks should not rely only on UI gating.

### 12. Audit trail

Status: Partial

Current state:
1. Stage history exists.
2. Some record updates are inferred through SharePoint updates.

Gaps to close:
1. There is no universal audit trail surface.
2. Key operations should be logged with who, what, when, and before/after state where feasible.
3. Document uploads and compliance actions should be auditable.

### 13. Mobile-responsive shell and usability

Status: Mostly implemented

Current state:
1. Shell and layouts already respond to viewport constraints.
2. Portal root/z-index hardening already exists.
3. Search overlay and modals have been stabilized.

Gaps to close:
1. Ensure all dialogs, autocomplete dropdowns, and assistive overlays consistently sit above the shell.
2. Maintain scroll and focus behavior under SharePoint hosting.

## Functional Implementation Strategy

### Phase 1: Normalize the GEMS model

Objective:
Remove residual contact/deal-centric interpretation from GEMS-facing UX and replace it with a stakeholder/government-engagement model.

Work items:
1. Standardize terminology in the shell, dashboard, assistant, help, settings, profile, company, and list views.
2. Retain existing SharePoint-backed field names where necessary, but hide internal identifiers from the user.
3. Ensure the user sees GEMS as a consolidated engagement system atop the KAIROS pool.

Acceptance criteria:
1. No GEMS-facing page reads like a legacy CRM clone.
2. Stakeholder and organization language is consistent.
3. Documents, compliance, follow-up, and engagement scoring are explicit in the wording and behavior.

### Phase 2: Complete the governance workflow

Objective:
Make engagements, actions, and follow-ups first-class.

Work items:
1. Expand engagement records to carry action items, due dates, owners, review status, and completion states where the current data model supports it.
2. Surface overdue follow-ups and pending actions in dashboard/profile/company surfaces.
3. Connect automation records to real user-facing reminders and business events.

Acceptance criteria:
1. A user can see what needs attention now.
2. A user can see what is due next.
3. Actions can be traced back to an originating engagement.

### Phase 3: Add compliance visibility

Objective:
Represent permits, licences, obligations, and regulatory items as visible operational concepts.

Work items:
1. Introduce or expose compliance-oriented views backed by SharePoint lists already available in the solution.
2. Surface status, due dates, and document links.
3. Tie compliance items to companies and relevant stakeholders.

Acceptance criteria:
1. Compliance items are visible in the app.
2. Their document attachments and deadlines are reachable.
3. They appear in summary surfaces where appropriate.

### Phase 4: Formalize document management

Objective:
Make company acumen and related documentation a true workflow, not a side card.

Work items:
1. Ensure upload/view/download flows are robust.
2. Make the canonical document obvious at the company level.
3. Allow preview/open/download behavior based on file type.
4. Surface document metadata in executive summaries where useful.

Acceptance criteria:
1. Company document handling is reliable and obvious.
2. Office/PDF/image preview behavior works consistently.
3. The document state is visible after upload and after page reload.

### Phase 5: Strengthen dashboard/reporting

Objective:
Improve reporting and management visibility.

Work items:
1. Keep the current charts and leaderboard, but expand the summary to include operational exceptions.
2. Add exports for the key filtered datasets.
3. Preserve fast, readable drilldowns.

Acceptance criteria:
1. Dashboard can answer executive questions at a glance.
2. Exported data matches the filtered on-screen data.
3. The dashboard remains responsive.

### Phase 6: Expand notifications and automation

Objective:
Turn automation into a genuine operational reminder system.

Work items:
1. Let automations drive birthday greetings, reminders, follow-ups, and seasonal messaging.
2. Add alert surfaces for assignment changes and overdue obligations.
3. Keep the notification UI lightweight and reliable.

Acceptance criteria:
1. The automation layer produces visible outcomes.
2. Notifications are tied to actionable data.
3. Users can clear and revisit notifications without breaking state.

### Phase 7: Harden RBAC and auditability

Objective:
Make access and changes safer and more traceable.

Work items:
1. Lock down create/edit controls for read-only views.
2. Ensure role checks are applied consistently.
3. Capture and expose audit events where the data model supports it.

Acceptance criteria:
1. Users only see actions they should use.
2. Important changes are traceable.
3. Read-only flows never show broken edit affordances.

### Phase 8: QA and regression pass

Objective:
Validate every route, overlay, data fetch, and create/update flow that exists in GEMS.

Work items:
1. Validate dashboard loads.
2. Validate stakeholder list and company list loads.
3. Validate stakeholder detail and company detail flows.
4. Validate GEMS interaction logging.
5. Validate profile page and photo loading.
6. Validate automations.
7. Validate search, notifications, and shell routing.
8. Validate document preview/upload.
9. Validate responsive behavior across modal and shell contexts.

Acceptance criteria:
1. No broken routes.
2. No overlay z-index regressions.
3. No stale profile routing.
4. No obvious data-loss regressions.
5. No console errors in normal navigation paths.

## Recommended Execution Order

1. Complete model normalization.
2. Complete governance workflow and follow-up visibility.
3. Complete compliance and document surfaces.
4. Complete reporting/export surfaces.
5. Harden automation and notifications.
6. Harden RBAC and audit surfaces.
7. Run full regression and fix all findings.

## Definition of Done

The GEMS implementation is complete only when all of the following are true:

1. The UI and behavior match the GEMS brief, not just the labels.
2. GEMS remains a layer over the KAIROS stakeholder pool and does not duplicate the registry.
3. Engagements, follow-ups, documents, compliance, reporting, and profile flows work coherently.
4. Search, overlays, and shell behavior remain stable.
5. The package builds successfully and ships cleanly.
6. A final QA sweep produces no unresolved functional gaps against the brief.

## Notes for Implementation Work

1. Do not reintroduce KAIROS-specific product framing into GEMS-facing screens.
2. Keep internal list names in the data layer only.
3. When a feature is not supported by the current SharePoint model, extend the model in GEMS only.
4. Where the brief requires a feature and the codebase only has a partial approximation, implement the feature rather than adding copy-only placeholders.
5. Any newly added surface must be backed by actual data, not static UI.

