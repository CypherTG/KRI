const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType, TableLayoutType, VerticalAlign, convertInchesToTwip,
  Header, Footer, PageNumber, NumberFormat, UnderlineType,
  PageBreak, HorizontalPositionAlign, FrameAnchorType,
} = require('docx');
const fs = require('fs');

// ─── COLOUR PALETTE ────────────────────────────────────────────
const C = {
  navy:       '0A2342',   // primary dark
  gold:       'C9A84C',   // accent
  lightGold:  'FDF6E3',   // accent fill
  teal:       '1A6B6B',   // section header
  midGrey:    '4A5568',   // body text
  lightGrey:  'F7F9FC',   // table zebra
  white:      'FFFFFF',
  border:     'D1D5DB',
  red:        'C0392B',
  green:      '1A7A4A',
};

// ─── HELPER: plain text run ────────────────────────────────────
const t = (text, opts = {}) => new TextRun({ text, font: 'Calibri', size: 22, color: C.midGrey, ...opts });
const bold = (text, opts = {}) => t(text, { bold: true, ...opts });
const h = (text, opts = {}) => t(text, { bold: true, size: 24, color: C.navy, ...opts });

// ─── HELPER: section heading paragraph ─────────────────────────
function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 320, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.gold, space: 4 } },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 26, color: C.navy, font: 'Calibri', allCaps: true }),
    ],
  });
}

// ─── HELPER: sub-heading ───────────────────────────────────────
function subHeading(text) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: C.teal, font: 'Calibri' })],
  });
}

// ─── HELPER: body paragraph ────────────────────────────────────
function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 21, color: C.midGrey, font: 'Calibri', ...opts })],
  });
}

// ─── HELPER: bullet ────────────────────────────────────────────
function bullet(text, bold_prefix = '') {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: convertInchesToTwip(0.3) },
    children: [
      new TextRun({ text: '• ', size: 21, color: C.gold, font: 'Calibri', bold: true }),
      ...(bold_prefix ? [new TextRun({ text: bold_prefix, size: 21, color: C.navy, font: 'Calibri', bold: true })] : []),
      new TextRun({ text: bold_prefix ? ` — ${text}` : text, size: 21, color: C.midGrey, font: 'Calibri' }),
    ],
  });
}

// ─── HELPER: spacer ────────────────────────────────────────────
const spacer = (pts = 160) => new Paragraph({ spacing: { before: pts, after: 0 }, children: [] });

// ─── HELPER: simple 2-col table ───────────────────────────────
function infoTable(rows, headerRow = null) {
  const tableRows = [];

  if (headerRow) {
    tableRows.push(new TableRow({
      tableHeader: true,
      children: headerRow.map((cell, i) => new TableCell({
        shading: { type: ShadingType.SOLID, color: C.navy },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: i === headerRow.length - 1 ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text: cell, bold: true, color: C.white, size: 20, font: 'Calibri' })],
        })],
      })),
    }));
  }

  rows.forEach(([col1, col2, col3, col4], idx) => {
    const isAlt = idx % 2 === 1;
    const shade = isAlt ? C.lightGrey : C.white;
    const cols = col4 !== undefined ? [col1, col2, col3, col4] : col3 !== undefined ? [col1, col2, col3] : [col1, col2];
    tableRows.push(new TableRow({
      children: cols.map((cell, i) => new TableCell({
        shading: { type: ShadingType.SOLID, color: shade },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: i >= (cols.length - 1) ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({
            text: String(cell),
            size: 20,
            font: 'Calibri',
            color: (cell && String(cell).startsWith('₦') && i >= cols.length - 1) ? C.teal : C.midGrey,
            bold: (i === 0 && !headerRow) || String(cell).includes('TOTAL') || String(cell).includes('Grand Total'),
          })],
        })],
      })),
    }));
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: C.border },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideH: { style: BorderStyle.SINGLE, size: 2, color: C.border },
      insideV: { style: BorderStyle.NONE },
    },
    rows: tableRows,
  });
}

// ─── HELPER: highlight box (key metric) ───────────────────────
function highlightBox(label, naira, usd) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 12, color: C.gold },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: C.gold },
      left: { style: BorderStyle.SINGLE, size: 12, color: C.gold },
      right: { style: BorderStyle.SINGLE, size: 12, color: C.gold },
      insideH: { style: BorderStyle.NONE },
      insideV: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.SOLID, color: C.lightGold },
          margins: { top: 140, bottom: 140, left: 240, right: 240 },
          children: [
            new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: C.navy, font: 'Calibri', allCaps: true })] }),
            new Paragraph({ children: [new TextRun({ text: naira, bold: true, size: 40, color: C.navy, font: 'Calibri' })] }),
            new Paragraph({ children: [new TextRun({ text: usd, size: 20, color: C.midGrey, font: 'Calibri', italics: true })] }),
          ],
        }),
      ],
    })],
  });
}

// ═══════════════════════════════════════════════════════════════
// BUILD DOCUMENT
// ═══════════════════════════════════════════════════════════════
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 22 } },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.1), right: convertInchesToTwip(1.1) },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 6, color: C.gold }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE } },
            rows: [new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'KAIROS / KRI PLATFORM', bold: true, size: 18, color: C.navy, font: 'Calibri' })] })] }),
              new TableCell({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Professional Quote  |  Ref: AEGIS/KRI/2026/001', size: 18, color: C.midGrey, font: 'Calibri', italics: true })] })] }),
            ]})],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.border } },
            alignment: AlignmentType.CENTER,
            spacing: { before: 80 },
            children: [
              new TextRun({ text: 'Prepared by Aegis Digital  |  30 June 2026  |  Confidential — Konstructum Only  |  Page ', size: 18, color: C.midGrey, font: 'Calibri' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: C.midGrey, font: 'Calibri' }),
              new TextRun({ text: ' of ', size: 18, color: C.midGrey, font: 'Calibri' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: C.midGrey, font: 'Calibri' }),
            ],
          }),
        ],
      }),
    },
    children: [

      // ── COVER ──────────────────────────────────────────────
      spacer(400),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: 'KAIROS PLATFORM', bold: true, size: 72, color: C.navy, font: 'Calibri' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: 'Konstructum Relationship Intelligence (KRI)', size: 32, color: C.teal, font: 'Calibri', italics: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.gold, space: 6 } },
        children: [],
      }),
      spacer(80),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: 'Professional Development, Deployment & Maintenance Quote', size: 26, color: C.midGrey, font: 'Calibri' })],
      }),
      spacer(40),
      infoTable([
        ['Prepared by', 'Aegis Digital (Developer)'],
        ['Prepared for', 'Konstructum'],
        ['Date', '30 June 2026'],
        ['Reference', 'AEGIS/KRI/2026/001'],
        ['Exchange Rate', '₦1,380 / $1 USD  (NFEM Official Rate, CBN — 30 June 2026)'],
        ['VAT', 'All prices exclusive of 7.5% VAT'],
        ['Validity', 'This quote is valid until 29 August 2026'],
      ]),
      spacer(80),

      // ── PAGE BREAK ─────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════
      // SECTION 1 — EXECUTIVE SUMMARY
      // ══════════════════════════════════════════════════════
      sectionHeading('1. Executive Summary'),
      body('This document presents the professional pricing for the KAIROS Platform (internally designated the KRI Platform — Konstructum Relationship Intelligence), a fully custom-built, enterprise-grade Client Relationship Management and Intelligence system, natively integrated into Konstructum\'s Microsoft 365 environment.'),
      spacer(60),
      body('The platform was designed, engineered, and deployed from the ground up as a zero-new-infrastructure solution — hosted entirely inside your existing SharePoint tenant and powered by Google Gemini AI, accessed securely through Microsoft Power Automate.'),
      spacer(60),
      body('This is not an off-the-shelf tool adapted for Konstructum\'s needs. This is purpose-built enterprise software, designed and built exclusively for Konstructum\'s proprietary KRI methodology.', { bold: true, color: C.navy }),

      spacer(120),

      // ══════════════════════════════════════════════════════
      // SECTION 2 — PLATFORM OVERVIEW
      // ══════════════════════════════════════════════════════
      sectionHeading('2. What Was Built — Platform Overview'),
      infoTable([
        ['Platform Name',        'KAIROS — Konstructum Relationship Intelligence (KRI)'],
        ['Deployment Model',     'SharePoint Framework (SPFx) Web Part — runs inside your M365 tenant'],
        ['Primary Framework',    'SPFx v1.18.2 + React 17 + Material UI v5'],
        ['State Management',     'Zustand v4 (production-grade global state)'],
        ['Data Store',           'Microsoft SharePoint Lists + Document Library'],
        ['AI Engine',            'Google Gemini (via Power Automate secure proxy)'],
        ['Routing',              'React Router v6 — 10 unique application routes'],
        ['Build System',         'Gulp + Webpack (SPFx-managed pipeline)'],
        ['Deployment Artefact',  '.sppkg package deployed to Tenant App Catalog'],
      ]),

      spacer(160),
      sectionHeading('3. Exact Codebase Metrics (Verified 30 June 2026)'),
      body('The following figures were produced by a live automated line-count audit run against the full source tree on the date of this quote.', { italics: true }),
      spacer(80),

      subHeading('3.1  Summary Totals'),
      infoTable([
        ['Total Source Files', '43'],
        ['Total Lines of Code', '17,263 lines (exact)'],
        ['Total Source Code Size', '~682 KB of hand-written TypeScript / React / JavaScript'],
        ['Estimated Development Hours', '~1,460 hours'],
        ['Equivalent Calendar Duration', '~9 months of senior specialist work'],
      ], ['Metric', 'Value']),

      spacer(120),
      subHeading('3.2  File-by-File Breakdown (All 43 Files)'),
      infoTable([
        ['graphApi.ts',                          'Data access service layer',                    '1,903',  '69.0 KB'],
        ['sharepointProvisioning.ts',            'Write / provisioning layer',                  '1,834',  '75.7 KB'],
        ['TeamDashboard.tsx',                    'Live dashboard with leaderboard & charts',     '1,302',  '50.9 KB'],
        ['ClientDetail.tsx',                     'Contact detail panel (all tabs)',              '1,199',  '52.5 KB'],
        ['AppShell.tsx',                         'Navigation shell & global layout',            '1,140',  '42.2 KB'],
        ['airosApi.ts',                          'AIROS AI assistant — 7 tool integrations',    '1,007',  '45.2 KB'],
        ['ClientBiodata.tsx',                    '42-field biodata engine',                       '821',  '34.4 KB'],
        ['ClientForm.tsx',                       'Contact create / edit form',                    '819',  '28.6 KB'],
        ['AirosAssistant.tsx',                   'AI chat UI component',                          '678',  '30.5 KB'],
        ['ClientList.tsx',                       'Contact registry (table + company view)',        '586',  '23.3 KB'],
        ['CompanyDetail.tsx',                    'Company page & acumen document manager',        '498',  '19.7 KB'],
        ['AutomationManager.tsx',                'Automation & reminder rules engine',            '459',  '17.7 KB'],
        ['HelpCenter.tsx',                       'Full in-app user manual',                       '452',  '20.9 KB'],
        ['EngagementForm.tsx',                   'Pipeline deal create / edit form',              '400',  '13.1 KB'],
        ['PipelineBoard.tsx',                    'Kanban deal board',                             '391',  '14.7 KB'],
        ['UserProfile.tsx',                      'Personal profile view',                         '372',  '16.1 KB'],
        ['SettingsPage.tsx',                     'App settings & preferences',                    '362',  '14.0 KB'],
        ['theme.ts',                             'MUI design system & theme tokens',              '293',  '10.6 KB'],
        ['App.tsx',                              'Root application & routing',                    '235',   '8.4 KB'],
        ['systemPrompt.ts',                      'AIROS AI system prompt constants',              '232',  '12.4 KB'],
        ['kairosScopedData.ts',                  'Scoped data service',                           '223',   '7.6 KB'],
        ['LogCommForm.tsx',                      'Communication log form',                        '222',   '6.8 KB'],
        ['KriPlatformWebPart.ts',                'SPFx web part entry point',                     '199',   '5.9 KB'],
        ['ClientCard.tsx',                       'Contact card component',                        '139',   '5.0 KB'],
        ['biodataLookups.ts',                    'Nigerian states, languages, religions lookup',  '138',   '3.6 KB'],
        ['useStore.ts',                          'Zustand global state store',                    '137',   '5.1 KB'],
        ['CommThread.tsx',                       'Communication thread display',                  '134',   '5.9 KB'],
        ['kairosPermissions.ts',                 'Role & permissions utility',                    '120',   '3.5 KB'],
        ['LoadingState.tsx',                     'Loading skeleton component',                    '119',   '5.2 KB'],
        ['StageProgressBar.tsx',                 'KRI stage progress indicator',                  '101',   '3.5 KB'],
        ['lookupHelpers.ts',                     'Lookup utility functions',                       '95',   '3.1 KB'],
        ['phoneDialCodes.ts',                    'International dial code constants',              '76',   '4.4 KB'],
        ['EmptyState.tsx',                       'Empty state component',                          '69',   '2.6 KB'],
        ['AnimatedCounter.tsx',                  'Animated number counter',                        '46',   '1.3 KB'],
        ['KriStageBadge.tsx',                    'KRI stage badge chip',                           '43',   '1.1 KB'],
        ['siteConfig.ts',                        'Site configuration constants',                   '42',   '1.4 KB'],
        ['KriPlatformWebPart.manifest.json',     'SPFx web part manifest',                         '26',   '0.7 KB'],
        ['mystrings.d.ts',                       'Localisation type definitions',                  '11',   '0.3 KB'],
        ['en-us.js',                             'English locale strings',                           '8',   '0.2 KB'],
        ['images.d.ts',                          'Image asset type declarations',                    '5',   '0.1 KB'],
        ['index.ts',                             'Package entry point',                              '3',   '0.1 KB'],
        ['system_prompt.js  (build root)',       'Compiled AI system prompt (build artefact)',       '4',  '14.7 KB'],
        ['system_prompt.tsx  (build root)',      'AI system prompt source',                        '320',  '17.9 KB'],
      ], ['File', 'Description', 'Lines', 'Size']),

      spacer(120),
      new Paragraph({
        spacing: { before: 100, after: 100 },
        shading: { type: ShadingType.SOLID, color: C.navy },
        children: [
          new TextRun({ text: '  GRAND TOTAL:  17,263 LINES  across  43 FILES  totalling  ~682 KB  of source code  ', bold: true, size: 24, color: C.white, font: 'Calibri' }),
        ],
      }),

      spacer(160),

      // ══════════════════════════════════════════════════════
      // SECTION 4 — MODULES
      // ══════════════════════════════════════════════════════
      sectionHeading('4. Module Breakdown'),
      infoTable([
        ['Module 1',  'Intelligent Dashboard',            'Live KPIs, activity chart, groups leaderboard, family filters, lazy avatar caching',           '1,302 lines'],
        ['Module 2',  'Contact Registry',                 'Dual-view (table + company), KRI stage progression, Excel bulk import, global search',         '2,584 lines'],
        ['Module 3',  'Biodata Engine',                   '42-field intelligence schema, Nigerian state/language/religion pickers, photo upload pipeline', '  821 lines'],
        ['Module 4',  'Company Acumen Manager',           'Auto-provisioned document library, inline PDF/Office viewer, company registry',                 '  498 lines'],
        ['Module 5',  'Pipeline & Engagement Board',      'Kanban deal board, estimated/actual value tracking, owner-filtered views',                      '  791 lines'],
        ['Module 6',  'AIROS AI Assistant',               '7 function-calling tools, Gemini AI, Power Automate secure proxy, markdown rendering',         '1,685 lines'],
        ['Module 7',  'Communications Logger',            'Interaction types, timestamped threads per contact, dashboard feed',                            '  356 lines'],
        ['Module 8',  'Automation Engine',                'Reminder & scheduled-message rule definitions, CRUD interface',                                 '  459 lines'],
        ['Module 9',  'User Profile & Settings',          'Theme toggle, landing page config, user registry reconciliation, import tool',                  '  734 lines'],
        ['Module 10', 'App Shell & Navigation',           'Sidebar, global search, notification controls, AIROS floating button, avatar resolution',       '1,140 lines'],
        ['Module 11', 'Help Center',                      'Full searchable in-app user manual',                                                            '  452 lines'],
        ['Infra',     'Data Layer (Services)',             'graphApi.ts + sharepointProvisioning.ts — schema-aware, bulletproof write layer',               '3,737 lines'],
        ['Infra',     'State, Theme, Utils, Constants',   'Zustand store, MUI theme, lookups, permissions, phone codes, AI prompt',                       '  704 lines'],
      ], ['#', 'Module', 'Key Features', 'Lines']),

      spacer(160),

      // ══════════════════════════════════════════════════════
      // SECTION 5 — DATA ARCHITECTURE
      // ══════════════════════════════════════════════════════
      sectionHeading('5. Data Architecture — SharePoint'),
      infoTable([
        ['KRI_Clients',       'Master contact registry with stage, ownership, photo URL'],
        ['KRI_Engagements',   'Pipeline and deal records'],
        ['KRI_Communications','Logged interactions (calls, emails, meetings, WhatsApp, etc.)'],
        ['KRI_StageHistory',  'KRI stage change audit trail (K → R → I)'],
        ['KRI_Automations',   'Reminder and rule definitions'],
        ['KRI_Users',         'Team registry with photos and family groupings'],
        ['KRI_Companies',     'Canonical company registry'],
        ['KRI_Projects',      'Searchable project lookup'],
        ['KRI_JobTitles',     'Deduplicated job title lookup'],
        ['KRI_CompanyAcumen', 'Company document metadata'],
        ['KRI_Biodata',       'Extended 42-field contact intelligence record'],
        ['KRI_AcumenFiles',   'Document Library — company acumen files (auto-provisioned)'],
      ], ['List / Library', 'Purpose']),

      spacer(160),

      // ══════════════════════════════════════════════════════
      // SECTION 6 — EFFORT ESTIMATION
      // ══════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeading('6. Effort Estimation — Hour Breakdown'),
      infoTable([
        ['Architecture, M365 Setup & SharePoint Provisioning',              '80 hrs'],
        ['11-List Schema Design & Implementation',                            '60 hrs'],
        ['Data Layer — graphApi.ts + sharepointProvisioning.ts',            '200 hrs'],
        ['AI / AIROS Integration — airosApi.ts, AirosAssistant, PA Flow',   '120 hrs'],
        ['App Shell & Navigation',                                            '80 hrs'],
        ['Team Dashboard (leaderboard, chart, KPIs)',                        '100 hrs'],
        ['Contact Registry (5 components, dual-view, stage system)',         '160 hrs'],
        ['Biodata Engine (42-field schema, Nigerian pickers, photo pipe)',    '80 hrs'],
        ['Company Management & Document Library',                             '60 hrs'],
        ['Pipeline Board & Engagement Forms',                                 '60 hrs'],
        ['Communications Logger',                                             '40 hrs'],
        ['Automation Engine',                                                 '60 hrs'],
        ['User Profile & Settings',                                           '40 hrs'],
        ['Help Center',                                                       '40 hrs'],
        ['UI/UX — Figma-to-Code (design system, Inter, light mode)',         '60 hrs'],
        ['Excel Bulk Import Pipeline',                                        '40 hrs'],
        ['Shared Components, Store, Utils, Theme',                            '40 hrs'],
        ['Testing, QA & Debugging',                                           '80 hrs'],
        ['Bug Fixing & Iterations',                                           '80 hrs'],
        ['Documentation (README, AI Guide, Biodata Schema, Architecture)',    '40 hrs'],
        ['TOTAL', '1,460 hrs'],
      ], ['Work Package', 'Hours']),
      spacer(60),
      body('Market rate for a Senior SPFx + AI + Microsoft 365 Specialist in Nigeria (June 2026): $40–$55/hr', { italics: true }),
      body('Source: lemon.io, arc.dev, Upwork.com — verified against Nigerian talent pool data, June 2026.', { italics: true, color: C.border }),

      spacer(160),

      // ══════════════════════════════════════════════════════
      // SECTION 7 — PRICING
      // ══════════════════════════════════════════════════════
      sectionHeading('7. Pricing'),

      subHeading('7A — Development (One-Time, Retrospective)'),
      infoTable([
        ['Core CRM Platform (Shell, routing, state, theme, all views)',   '560 hrs', '₦31,050/hr',  '₦17,388,000'],
        ['Data Layer Engineering (schema-aware, self-adapting API)',       '200 hrs', '₦31,050/hr',  '₦6,210,000'],
        ['AI / AIROS Integration (7 tools, secure arch, Power Automate)', '120 hrs', '₦35,880/hr',  '₦4,305,600'],
        ['Biodata Engine (42-field schema, Nigerian data)',                 '80 hrs', '₦31,050/hr',  '₦2,484,000'],
        ['M365 Architecture & SharePoint Provisioning',                   '140 hrs', '₦27,600/hr',  '₦3,864,000'],
        ['Design System Implementation (Figma → code)',                    '60 hrs', '₦27,600/hr',  '₦1,656,000'],
        ['Excel Bulk Import Pipeline',                                      '40 hrs', '₦27,600/hr',  '₦1,104,000'],
        ['Testing, QA, Bugs, Documentation',                              '200 hrs', '₦24,840/hr',  '₦4,968,000'],
        ['Specialist Premium (SPFx scarcity & IP)',                           '—',         '—',  '₦3,020,400'],
        ['TOTAL DEVELOPMENT',                                          '1,460 hrs',         '—', '₦45,000,000'],
      ], ['Line Item', 'Hours', 'Rate', 'Cost (NGN)']),
      spacer(60),
      body('~$32,609 USD at ₦1,380/$1  |  Market benchmark: advanced mid-market CRM with AI — ₦40M–₦80M range', { italics: true }),

      spacer(140),
      subHeading('7B — Deployment & Go-Live (One-Time)'),
      infoTable([
        ['Tenant App Catalog registration & web part deployment',      '₦200,000'],
        ['SharePoint list provisioning (11 lists + full schema)',       '₦300,000'],
        ['KRI_AcumenFiles document library provisioning',              '₦100,000'],
        ['Power Automate Flow build & API key configuration',          '₦200,000'],
        ['User registry seeding & reconciliation',                     '₦150,000'],
        ['M365 permission scoping & tenant-level configuration',       '₦200,000'],
        ['Go-live support (2 days on-call hypercare)',                 '₦400,000'],
        ['Admin & team training (half-day session)',                   '₦450,000'],
        ['TOTAL DEPLOYMENT',                                         '₦2,000,000'],
      ], ['Line Item', 'Cost (NGN)']),
      spacer(60),
      body('~$1,449 USD', { italics: true }),

      spacer(140),
      subHeading('7C — Monthly Maintenance Retainer (Three Tiers)'),
      infoTable([
        ['TIER 1 — Essential',  'Critical bug fixes (48hr response), security patches, SharePoint compatibility fixes, monthly health check',              '₦350,000/month',  '₦4,200,000/yr'],
        ['TIER 2 — Standard ★', 'All Tier 1 + minor features (8 hrs/mo), AI prompt tuning, new SP columns, quarterly roadmap call, 24hr priority support', '₦600,000/month',  '₦7,200,000/yr'],
        ['TIER 3 — Premium',    'All Tier 2 + new module dev (20 hrs/mo), annual version upgrade, NDPA compliance audit, dedicated developer access',       '₦950,000/month', '₦11,400,000/yr'],
      ], ['Tier', 'What\'s Included', 'Monthly', 'Annual']),
      spacer(60),
      body('★  Tier 2 Standard is the recommended option for sustained platform growth.', { bold: true, color: C.teal }),

      spacer(160),
      new Paragraph({ children: [new PageBreak()] }),

      // ══════════════════════════════════════════════════════
      // SECTION 8 — COMMERCIAL PACKAGES
      // ══════════════════════════════════════════════════════
      sectionHeading('8. Commercial Packages'),
      spacer(80),

      highlightBox('Package A — Delivery Only', '₦47,000,000', 'Development ₦45M + Deployment ₦2M  |  3-month warranty included  |  ~$34,058 USD'),
      spacer(100),
      highlightBox('Package B — Year 1 Bundle  ★ Best Value', '₦53,000,000', 'Dev ₦45M + Deploy ₦2M + 12× Standard Retainer ₦7.2M  |  Saves ₦1,200,000  |  ~$38,406 USD'),
      spacer(100),
      highlightBox('Package C — 2-Year Enterprise', '₦58,000,000', 'Dev ₦45M + Deploy ₦2M + 24× Standard Retainer ₦14.4M  |  Saves ₦3,400,000  |  ~$42,029 USD'),

      spacer(160),

      // ══════════════════════════════════════════════════════
      // SECTION 9 — ZERO INFRASTRUCTURE COST
      // ══════════════════════════════════════════════════════
      sectionHeading('9. What Konstructum Does NOT Pay For'),
      body('Because KAIROS runs natively inside your Microsoft 365 tenant, the following costs — which every competing solution carries — are ₦0:'),
      spacer(60),
      infoTable([
        ['Cloud hosting (AWS, Azure App Services, etc.)',      '₦0  —  uses existing SharePoint'],
        ['Database licensing (SQL, MongoDB, etc.)',            '₦0  —  SharePoint Lists'],
        ['SSL certificates',                                   '₦0  —  Microsoft manages'],
        ['Backup & disaster recovery',                         '₦0  —  Microsoft manages'],
        ['Server maintenance',                                 '₦0'],
        ['Power Automate (AI proxy)',                          '₦0  —  included in your M365 license'],
        ['Uptime monitoring',                                  '₦0  —  Microsoft 99.9% SLA'],
        ['Security updates to infrastructure',                 '₦0  —  Microsoft manages'],
        ['Estimated annual infrastructure saving vs. hosted', '₦3,600,000 – ₦8,400,000 / year'],
      ], ['Cost Item', 'Status']),

      spacer(160),

      // ══════════════════════════════════════════════════════
      // SECTION 10 — COMPETITIVE CONTEXT
      // ══════════════════════════════════════════════════════
      sectionHeading('10. Competitive Benchmark'),
      infoTable([
        ['Salesforce Enterprise (10 users)',    '₦30M–₦55M/yr',         'Limited',   'Salesforce cloud'],
        ['HubSpot Professional (10 users)',     '₦18M–₦30M/yr',         'Moderate',  'HubSpot cloud'],
        ['Zoho CRM Ultimate (10 users)',        '₦8M–₦15M/yr',          'Moderate',  'Zoho cloud'],
        ['KAIROS Platform (this build)',        '₦4.2M–₦11.4M/yr (maintenance only)',  '100% custom',  'Your M365 tenant  ✓'],
      ], ['Solution', 'Annual Cost', 'Customisation', 'Data Location']),
      spacer(60),
      body('KAIROS is the only option where Konstructum owns the code outright, data never leaves your Microsoft tenant, and the system is built precisely for your KRI methodology — not a generic sales pipeline.', { bold: true, color: C.navy }),

      spacer(160),

      // ══════════════════════════════════════════════════════
      // SECTION 11 — PAYMENT TERMS
      // ══════════════════════════════════════════════════════
      sectionHeading('11. Payment Terms'),
      subHeading('Suggested Milestone Schedule (Development)'),
      infoTable([
        ['Contract signing',                         '40% upfront',        '₦18,000,000'],
        ['Alpha delivery (core modules live)',        '30% on milestone',   '₦13,500,000'],
        ['UAT completion & go-live',                 '20% on milestone',    '₦9,000,000'],
        ['30-day post-launch sign-off',              '10% final',           '₦4,500,000'],
        ['TOTAL',                                    '',                   '₦45,000,000'],
      ], ['Milestone', 'Schedule', 'Amount (NGN)']),
      spacer(60),
      bullet('Maintenance retainers are invoiced monthly, due within 14 days of invoice.'),
      bullet('3-month advance payment available at 5% discount.'),

      spacer(160),

      // ══════════════════════════════════════════════════════
      // SECTION 12 — SUMMARY
      // ══════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeading('12. Final Summary'),
      infoTable([
        ['Development (one-time)',               '₦45,000,000',   '~$32,609'],
        ['Deployment & Go-Live (one-time)',       '₦2,000,000',    '~$1,449'],
        ['Maintenance Tier 1 — Essential',        '₦350,000/mo',   '~$254/mo'],
        ['Maintenance Tier 2 — Standard ★',       '₦600,000/mo',   '~$435/mo'],
        ['Maintenance Tier 3 — Premium',          '₦950,000/mo',   '~$688/mo'],
        ['Package A — Delivery Only',             '₦47,000,000',   '~$34,058'],
        ['Package B — Year 1 Bundle  ★',          '₦53,000,000',   '~$38,406'],
        ['Package C — 2-Year Enterprise',         '₦58,000,000',   '~$42,029'],
      ], ['Item', 'NGN', 'USD']),
      spacer(60),
      body('Exchange rate: ₦1,380/$1 (NFEM Official, CBN — 30 June 2026)  |  All prices exclusive of 7.5% VAT', { italics: true }),

      spacer(200),

      // ── ACCEPTANCE ─────────────────────────────────────────
      sectionHeading('13. Acceptance'),
      body('To proceed, Konstructum should:'),
      bullet('Select preferred package (A, B, or C) and maintenance tier'),
      bullet('Execute the Service Agreement provided separately'),
      bullet('Submit the initial 40% deposit (for development) or first retainer payment (for maintenance-only)'),
      spacer(80),
      body('This quote is valid for 60 days from the date of issue — until 29 August 2026. Prices are subject to revision after this date due to exchange rate fluctuations and market conditions.'),

      spacer(200),
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.gold } },
        spacing: { before: 120 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Prepared by Aegis Digital  |  30 June 2026  |  Confidential — For Konstructum Only', size: 18, color: C.midGrey, font: 'Calibri', italics: true })],
      }),
    ],
  }],
});

// ─── WRITE FILE ────────────────────────────────────────────────
Packer.toBuffer(doc).then(buffer => {
  const outPath = 'KAIROS_KRI_Platform_Quote_June2026.docx';
  fs.writeFileSync(outPath, buffer);
  console.log('\n  ✅  Word document saved: ' + outPath);
  console.log('  📄  Location: c:\\Aegis\\KRI\\' + outPath + '\n');
}).catch(err => {
  console.error('  ❌  Failed:', err.message);
});
