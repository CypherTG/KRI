# KRI Platform: Comprehensive Development Context

This document serves as the absolute source of truth for the **KRI (Konstructum Relationship Intelligence) Platform** development. It details the architecture, data layer, state management, and the UX/UI paradigm shift currently underway.

---

## 1. Project Overview & Business Value
The **KRI Platform** is a specialized CRM and intelligence dashboard built directly into Microsoft SharePoint via the SharePoint Framework (SPFx). It manages client pipelines, tracks communication, and moves contacts through three specific relationship stages:
1. **Knowledge** (Initial Awareness)
2. **Rapport** (Established communication)
3. **Intimacy** (Deep business partnership)

By hosting entirely within SharePoint, Konstructum retains full data sovereignty and utilizes existing Microsoft 365 licensing.

---

## 2. Technical Stack & Architecture

### Environment
*   **Framework:** SharePoint Framework (SPFx) v1.18.2
*   **Core Library:** React 17.0.1
*   **UI Component Library:** `@mui/material` v5 (Material UI)
*   **State Management:** `zustand` v4
*   **Routing:** `react-router-dom` v6
*   **Build System:** Gulp (`gulp serve --nobrowser`), Webpack
*   **Deployment:** Bundled to `.sppkg` dropped into the Tenant App Catalog.

### State Management (`useStore()`)
Zustand controls the global frontend state. It caches the data arrays fetched from SharePoint so the UI can filter, sort, and display real-time dashboard metrics (e.g., KRI Funnel counts, Pipeline Value, Active Deals) without re-fetching on every page load.

---

## 3. The Data Layer & API Strategy (CRITICAL)

The platform relies on data stored in **6 SharePoint Custom Lists**:
1.  `KRI_Clients`
2.  `KRI_Engagements`
3.  `KRI_Communications`
4.  `KRI_StageHistory`
5.  `KRI_Automations`
6.  `KRI_Users`

### The API Breakthrough (Native Fetch + Schema-Aware Formatting)
SPFx's native `SPHttpClient` defaults to OData v4, which caused severe parse errors (`PrimitiveValue`) when trying to POST to standard SharePoint v3 endpoints.

**The Solution:**
*   **Reads** use `SPHttpClient` with `odata=nometadata`.
*   **Writes (Create/Update/Delete)** completely bypass `SPHttpClient`. They use the browser's native `fetch()` API.
*   The code first requests the `X-RequestDigest` token via `/_api/contextinfo`.
*   **Dynamic Schema Resolution:** Before writing to a list, the app dynamically queries SharePoint for that list's column types (`/_api/.../fields?$select=InternalName,TypeAsString`).
*   **Auto-Formatting Payload:** The payload is dynamically formatted based on the true SharePoint column type. This permanently solves the formatting errors:
    *   **Hyperlinks (`URL`):** Formats plain strings into `{ "Url": "https://...", "Description": "https://..." }`.
    *   **Lookups/Users:** Appends `Id` to the field name (e.g., `UserId`) and passes an integer.
    *   **Booleans:** Safely converts string `'true'`/`'1'` to boolean `true`.
    *   **DateTime:** Enforces `.toISOString()`.

This data layer is now **bulletproof and self-adapting** to any SharePoint list schema changes.

---

## 4. UI/UX Paradigm Shift (The "Figma Replica" Initiative)

### Current State (To Be Removed)
The application was initially designed with a heavy "Space / Cyberpunk" aesthetic:
*   Dark mode (`#080E1C` backgrounds).
*   Glassmorphism, glowing borders (`#4F8EF7`), and linear-gradient panels.
*   Neon accents on charts and animated counters.

### Target State (The Aggressive Refactor)
The user has provided a definitive **Figma Design** (`74Pngjif8NlyoS0weLTxgI/KRI`). The new mandate is a **1:1 Replica** of this design.

**Key Design Tokens for the Refactor:**
1.  **Strict Light Mode:** 
    *   Main App Background: Light gray/white (`#F5F6FA`, `#FFFFFF`).
    *   Text: Charcoal/Black (`#111827`) with soft grey subtitles (`#6B7280`).
2.  **Typography & White Space:**
    *   Heavier use of standard, modern SaaS tracking.
    *   No neon text shadows. Clean, crisp sans-serif (Inter).
3.  **AppShell (Navigation):**
    *   White sidebar with simple black/gray text.
    *   Active states are indicated by soft, pill-shaped primary color backgrounds (e.g., a solid blue for "Contact List").
4.  **Cards & Components:**
    *   Pure white cards (`#FFFFFF`).
    *   Border radius is softer, matching modern aesthetics (e.g., `borderRadius: 16`).
    *   Shadows are very subtle and diffused (e.g., `rgba(0,0,0,0.05)`).
5.  **Colors:**
    *   Primary Calls to Action (CTA): Solid vivid colors (e.g., `Red #FF1A1A` for "+ Add New Contact", `Blue #477BFF` for primary actions/tables).
    *   Input Fields: Very faint gray background (`#F9FAFB`), no harsh borders until focused.

---

## 5. Roadmap

1.  **Overwrite `theme.ts`**: Completely strip the dark mode. Implement the clean, white/light-gray palette.
2.  **Refactor `AppShell.tsx`**: Replace the dark sidebar with the clean, white flat-design sidebar.
3.  **Refactor Views (`TeamDashboard.tsx`, `ClientList`, etc)**: Replace gradients, remove glowing borders, apply simple shadows, and match data grid styles to the Figma screenshots.
4.  **Adopt Forms**: Clean up all modals/forms to use standard light-themed inputs with floating or direct labels, exactly as designed.
