# GEMS Execution Task

This task file is the step-by-step execution companion to `implementation_plan.md`.

## Objective

Complete GEMS so it matches the product brief functionally, while preserving the current stable SharePoint-backed architecture and leaving KAIROS untouched.

## Constraints

1. Work only inside `C:\Aegis\KRI\gems`.
2. Do not modify `C:\Aegis\KRI\kri-platform`.
3. Do not introduce a parallel stakeholder registry.
4. Preserve stable existing behavior unless a change is required to close a brief gap.
5. Validate each phase before moving forward.

## Execution Checklist

### 1. Confirm data model and terminology

- Verify all GEMS-facing pages use stakeholder/government-engagement language.
- Verify all reads still resolve from the canonical KRI pool.
- Verify company-level views still inherit from the same source data.
- Verify user profile photos and names continue to resolve from the people registry.

Done means:
- No visible GEMS page implies a separate client source of truth.
- Users understand GEMS as a layer over existing SharePoint data.

### 2. Complete stakeholder and company surfaces

- Validate stakeholder registry filtering and search.
- Validate company/organization grouping.
- Validate detail pages for stakeholder, company, and profile.
- Verify company acumen upload, preview, download, and replacement flows.

Done means:
- Stakeholder and company pages open reliably.
- The canonical company document is visible and actionable.
- Search results remain functional across the shell.

### 3. Implement or complete engagement workflow

- Verify interaction logging flow.
- Verify category scoring.
- Verify follow-up date and status capture.
- Verify executive management request logic.
- Verify leaderboard and point calculation.

Done means:
- An engagement can be logged end-to-end without console errors.
- The saved record reappears on reload.
- Scores are reflected in profile and dashboard views.

### 4. Add operational follow-up visibility

- Surface open follow-ups and overdue items where data exists.
- Surface reminder-related automation behavior.
- Ensure users can identify what needs action next.

Done means:
- The app shows actionable operational items, not only historical records.

### 5. Complete compliance and regulatory visibility

- Expose compliance-related items in the UI if supported by the model.
- Connect obligations, permits, licences, and documents to companies.
- Ensure the reporting surfaces can include compliance information.

Done means:
- Compliance is represented as a real workflow surface.

### 6. Strengthen dashboards and reporting

- Keep current dashboard working.
- Add missing executive-summary data if not already present.
- Keep export/report generation reliable.
- Validate drilldowns and filters.

Done means:
- Dashboard answers executive questions fast.
- Exported data matches on-screen filtering.

### 7. Expand automation and notifications

- Verify birthday, reminder, follow-up, and seasonal automations.
- Verify notification center behavior.
- Ensure notification actions do not break routing or focus.

Done means:
- Notifications reflect real app events.
- Automations are actionable, not decorative.

### 8. Enforce role-based behavior

- Ensure read-only views remain read-only.
- Ensure create/update actions are hidden or disabled appropriately.
- Ensure admin-only operations stay gated.

Done means:
- No user sees actions they should not use.

### 9. Add auditability where possible

- Validate stage history.
- Add change history surfaces for other key record types if supported.
- Ensure key document and engagement actions are traceable.

Done means:
- Important changes can be reviewed after the fact.

### 10. Final QA sweep

- Navigate every route.
- Open every modal.
- Trigger every dropdown, autocomplete, and search overlay.
- Save one record in each major workflow.
- Reload and verify persistence.
- Check for console errors.
- Check for z-index / underlay issues.

Done means:
- No obvious broken flows remain.
- No critical console errors appear in normal use.

## Suggested Implementation Sequence

1. Normalize stakeholder/organization language.
2. Finish workflow gaps for engagements and follow-ups.
3. Finish compliance and document visibility.
4. Tighten dashboard/profile summaries.
5. Harden notifications, automation, and RBAC.
6. Run full QA and patch regressions.

## Success Criteria

The task is complete when:

1. GEMS matches the brief functionally.
2. GEMS remains a SharePoint-backed layer over the KRI data pool.
3. The package builds and packages successfully.
4. The main user journeys are stable.
5. Any remaining gaps are documented explicitly rather than hidden.

