/**
 * Populates missing data across both KAIROS and GEMS tables in the shared
 * Neon / Postgres database.
 *
 *   node scripts/seed-missing-data.mjs
 *
 * Safe & idempotent:
 *  1. Applies both KAIROS (schema.sql) and GEMS (gems-schema.sql) schemas.
 *  2. Imports ../KRI Past Registry.csv if `clients` is empty.
 *  3. Backfills `users.department` where blank.
 *  4. Seeds operational tables (`communications`, `engagements`, `automations`,
 *     `stage_history`, `biodata`, `gems_interactions`, `gems_compliance`,
 *     `gems_actions`, `gems_audit_log`) ONLY when a table currently has 0 rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import * as XLSX from 'xlsx';

for (const file of ['.env.local', '.env', '../kairos-web/.env.local', '../gems-web/.env.local']) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, k, rawVal] = m;
    const val = rawVal.replace(/^["']|["']$/g, '');
    if (!process.env[k] && val !== '') process.env[k] = val;
  }
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('\n  DATABASE_URL is not set in .env.local or environment.');
  console.error('  Paste your Neon PostgreSQL connection string into .env.local and re-run:');
  console.error('    npm run db:seed-data\n');
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: /neon\.tech|neon\.build|supabase\./i.test(url) ? 'require' : undefined,
  onnotice: () => {},
});

const AGENCIES = ['NUPRC', 'NUIMS', 'NCDMB', 'NEPL', 'NNPC', 'NIMASA', 'ENSERV', 'NMDPRA'];

function resolveAgency(companyName) {
  const key = String(companyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!key) return '';
  if (key.includes('nepl')) return 'NEPL';
  if (key.includes('nnpc')) return 'NNPC';
  return AGENCIES.find((a) => key.includes(a.toLowerCase())) || '';
}

async function countRows(table) {
  const rows = await sql.unsafe(`SELECT count(*)::int AS total FROM ${table}`);
  return rows[0]?.total ?? 0;
}

async function main() {
  console.log(`\n=== Seeding shared KAIROS + GEMS database (${new URL(url).hostname}) ===\n`);

  // 1. Ensure schemas exist
  const schemaPaths = [
    path.resolve(process.cwd(), 'db/schema.sql'),
    path.resolve(process.cwd(), 'db/gems-schema.sql'),
    path.resolve(process.cwd(), '../gems-web/db/gems-schema.sql'),
  ];
  for (const sp of schemaPaths) {
    if (fs.existsSync(sp)) {
      await sql.unsafe(fs.readFileSync(sp, 'utf8'));
    }
  }
  console.log('  [OK] Database schemas verified (KAIROS + GEMS)');

  // 2. Import KRI Past Registry.csv if clients table is empty
  const clientCount = await countRows('clients');
  const csvPath = path.resolve(process.cwd(), '../KRI Past Registry.csv');
  if (clientCount === 0 && fs.existsSync(csvPath)) {
    console.log('  [..] `clients` is empty — importing ../KRI Past Registry.csv …');
    const wb = XLSX.read(fs.readFileSync(csvPath), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let imported = 0;
    for (const row of rows) {
      const firstName = String(row['First Name'] || '').trim();
      const lastName = String(row['Last Name'] || '').trim();
      const email = String(row['Email'] || '').trim() || null;
      const companyName = String(row['Company Name'] || '').trim() || null;
      const jobTitle = String(row['Job Title'] || '').trim() || null;
      const gender = String(row['Gender'] || '').trim() || null;
      const rawStage = String(row['KRI'] || '').trim();
      const kriStage = ['Knowledge', 'Rapport', 'Intimacy'].includes(rawStage) ? rawStage : 'Knowledge';
      const projectName = String(row['Project Name'] || '').trim() || null;
      let phone = String(row['Phone Number'] || '').trim() || null;
      if (phone && /^[\d.]+e\+?\d+$/i.test(phone)) {
        phone = String(Math.round(Number(phone)));
      }
      const instagram = String(row['Instagram account'] || '').trim() || null;
      const linkedin = String(row['LinkedIn URL'] || '').trim() || null;

      if (!firstName && !lastName && !email && !companyName) continue;

      await sql`
        INSERT INTO clients (
          first_name, last_name, email, company_name, job_title, gender,
          kri_stage, project_name, phone, instagram_handle, linkedin_url,
          business_arms
        ) VALUES (
          ${firstName}, ${lastName}, ${email}, ${companyName}, ${jobTitle}, ${gender},
          ${kriStage}, ${projectName}, ${phone}, ${instagram}, ${linkedin},
          ${['KCC']}
        )
      `;
      imported++;
    }
    await sql`
      INSERT INTO companies (company_key, company_name, canonical_name, status)
      SELECT DISTINCT lower(company_name), company_name, company_name, 'Active'
        FROM clients WHERE coalesce(company_name, '') <> ''
      ON CONFLICT (company_key) DO NOTHING
    `;
    await sql`
      UPDATE companies co SET contact_count = coalesce(
        (SELECT count(*) FROM clients c WHERE lower(c.company_name) = co.company_key), 0
      )
    `;
    await sql`
      INSERT INTO projects (project_key, project_name, status)
      SELECT DISTINCT lower(project_name), project_name, 'Active'
        FROM clients WHERE coalesce(project_name, '') <> ''
      ON CONFLICT (project_key) DO NOTHING
    `;
    await sql`
      INSERT INTO job_titles (job_title_key, job_title_name, status)
      SELECT DISTINCT lower(job_title), job_title, 'Active'
        FROM clients WHERE coalesce(job_title, '') <> ''
      ON CONFLICT (job_title_key) DO NOTHING
    `;
    console.log(`  [OK] Imported ${imported} contacts from KRI Past Registry.csv`);
  } else {
    console.log(`  [OK] Contacts already present (${clientCount} rows)`);
  }

  // Ensure all 8 monitored GEMS agencies have at least one stakeholder & company record
  const existingAgencies = await sql`
    SELECT id, first_name, last_name, company_name, kri_stage FROM clients
  `;
  const coveredAgencies = new Set(
    existingAgencies.map((c) => resolveAgency(c.company_name)).filter(Boolean),
  );
  const sampleAgencyContacts = [
    { agency: 'NUPRC', company: 'NUPRC (Nigerian Upstream Petroleum Regulatory Commission)', first: 'Engr. Gbenga', last: 'Komolafe', title: 'Commission Chief Executive', stage: 'Rapport', arm: 'KCC' },
    { agency: 'NUIMS', company: 'NUIMS (NNPC Upstream Investment Management Services)', first: 'Bala', last: 'Wunti', title: 'Chief Upstream Investment Officer', stage: 'Intimacy', arm: 'KCC' },
    { agency: 'NCDMB', company: 'NCDMB (Nigerian Content Development & Monitoring Board)', first: 'Engr. Felix', last: 'Omatsola Ogbe', title: 'Executive Secretary', stage: 'Rapport', arm: 'INTERKONSTRUCT' },
    { agency: 'NEPL', company: 'NEPL (NNPC E&P Limited)', first: 'Mustapha', last: 'Sugungun', title: 'Managing Director', stage: 'Rapport', arm: 'KCC' },
    { agency: 'NNPC', company: 'NNPC Limited', first: 'Justin', last: 'Ezeala', title: 'Managing Director', stage: 'Knowledge', arm: 'PMT7' },
    { agency: 'NIMASA', company: 'NIMASA (Nigerian Maritime Administration and Safety Agency)', first: 'Dr. Dayo', last: 'Mobereola', title: 'Director General', stage: 'Rapport', arm: 'INTERKONSTRUCT' },
    { agency: 'ENSERV', company: 'ENSERV (NNPC Energy Services)', first: 'ritamary', last: 'Okafor', title: 'Head of Operations & Technical Services', stage: 'Knowledge', arm: 'PMT7' },
    { agency: 'NMDPRA', company: 'NMDPRA (Nigerian Midstream and Downstream Petroleum Regulatory Authority)', first: 'Engr. Farouk', last: 'Ahmed', title: 'Authority Chief Executive', stage: 'Knowledge', arm: 'KCC' },
  ];

  for (const item of sampleAgencyContacts) {
    if (!coveredAgencies.has(item.agency)) {
      await sql`
        INSERT INTO clients (
          first_name, last_name, company_name, job_title, kri_stage, business_arms, notes
        ) VALUES (
          ${item.first}, ${item.last}, ${item.company}, ${item.title}, ${item.stage},
          ${[item.arm]}, ${`Key regulatory stakeholder for ${item.agency}`}
        )
      `;
      await sql`
        INSERT INTO companies (company_key, company_name, canonical_name, status, contact_count)
        VALUES (${item.company.toLowerCase()}, ${item.company}, ${item.company}, 'Active', 1)
        ON CONFLICT (company_key) DO NOTHING
      `;
      console.log(`  [+] Added missing regulatory stakeholder for ${item.agency}`);
    }
  }

  // Get primary user to attribute seeded records to (or create default verified admin on a brand-new DB)
  let users = await sql`SELECT id, email, display_name FROM users ORDER BY is_admin DESC, created_at ASC LIMIT 5`;
  if (users.length === 0) {
    const bcrypt = (await import('bcryptjs')).default;
    const adminEmail = String(process.env.ADMIN_EMAIL || 'mbello@konstructum.com').trim();
    const adminPassword = String(process.env.ADMIN_PASSWORD || 'KairosAdmin2026!').trim();
    const adminName = String(process.env.ADMIN_NAME || 'KAIROS Administrator').trim();
    const hash = await bcrypt.hash(adminPassword, 10);
    await sql`
      INSERT INTO users (
        email, password_hash, display_name, title, job_title, department,
        is_admin, is_active, email_verified_at
      ) VALUES (
        ${adminEmail}, ${hash}, ${adminName}, ${adminName}, 'Administrator', 'Konstructum',
        TRUE, TRUE, now()
      )
      ON CONFLICT (email) DO UPDATE
        SET is_admin = TRUE,
            is_active = TRUE,
            email_verified_at = COALESCE(users.email_verified_at, now()),
            department = COALESCE(NULLIF(users.department, ''), 'Konstructum')
    `;
    console.log(`  [OK] Created verified founding admin: ${adminEmail} (password: ${adminPassword})`);
    users = await sql`SELECT id, email, display_name FROM users ORDER BY is_admin DESC, created_at ASC LIMIT 5`;
  } else {
    const targetAdminEmail = String(process.env.ADMIN_EMAIL || 'mbello@konstructum.com').trim();
    await sql`
      UPDATE users
         SET email = ${targetAdminEmail},
             department = 'Konstructum',
             email_verified_at = COALESCE(email_verified_at, now())
       WHERE email = 'onechief011@gmail.com'
         AND NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(${targetAdminEmail}))
    `;
    await sql`
      UPDATE users
         SET department = 'Konstructum'
       WHERE coalesce(department, '') = ''
    `;
    await sql`
      UPDATE users
         SET email_verified_at = now()
       WHERE is_admin = TRUE AND email_verified_at IS NULL
    `;
    users = await sql`SELECT id, email, display_name FROM users ORDER BY is_admin DESC, created_at ASC LIMIT 5`;
  }
  const defaultUser = users[0] || { id: null, email: 'mbello@konstructum.com', display_name: 'KAIROS Administrator' };

  // Fetch sample clients for relational seeding
  const sampleClients = await sql`
    SELECT id, first_name, last_name, company_name, kri_stage, job_title
      FROM clients
     WHERE coalesce(first_name, '') <> '' AND coalesce(company_name, '') <> ''
     ORDER BY CASE kri_stage WHEN 'Intimacy' THEN 1 WHEN 'Rapport' THEN 2 ELSE 3 END
     LIMIT 20
  `;

  // 3. Seed `communications` if empty
  if ((await countRows('communications')) === 0 && sampleClients.length > 0) {
    const commsSeed = [
      { idx: 0, type: 'Meeting', subject: 'Executive Project Alignment & JV Structure Review', notes: 'Met with executive team to review Project 1500 deliverables and Q3 commercial milestones.', followUp: true, daysAgo: 2, followUpDays: 5, proposal: true },
      { idx: 1, type: 'Phone Call', subject: 'Technical Qualification Follow-Up', notes: 'Discussed technical tender package requirements and local content NCDMB compliance certificates.', followUp: true, daysAgo: 4, followUpDays: 3, proposal: false },
      { idx: 2, type: 'Email', subject: 'Capability Statement & Acumen Submission', notes: 'Shared updated Konstructum Group corporate profile and past EPC execution references.', followUp: false, daysAgo: 7, followUpDays: null, proposal: true },
      { idx: 3, type: 'Meeting', subject: 'Quarterly Relationship Check-In', notes: 'Courtesy visit to review upcoming upstream maintenance schedule and procurement windows.', followUp: true, daysAgo: 10, followUpDays: 7, proposal: false },
      { idx: 4, type: 'Message', subject: 'Invitation to Industry Roundtable', notes: 'Confirmed attendance at the Lagos Energy Stakeholder Forum.', followUp: false, daysAgo: 14, followUpDays: null, proposal: false },
      { idx: 5, type: 'Tender', subject: 'ITT Clarification & Commercial Bid Submission', notes: 'Submitted technical and commercial clarifications ahead of bid closing.', followUp: true, daysAgo: 1, followUpDays: 4, proposal: true },
    ];
    for (const item of commsSeed) {
      const c = sampleClients[item.idx % sampleClients.length];
      const commDate = new Date(Date.now() - item.daysAgo * 86400000).toISOString();
      const followDate = item.followUpDays
        ? new Date(Date.now() + item.followUpDays * 86400000).toISOString().slice(0, 10)
        : null;
      await sql`
        INSERT INTO communications (
          client_id, subject, communication_type, notes, communication_date,
          logged_by_id, logged_by_label, follow_up_required, follow_up_date, proposal_submitted
        ) VALUES (
          ${c.id}, ${item.subject}, ${item.type}, ${item.notes}, ${commDate},
          ${defaultUser.id}, ${defaultUser.display_name || defaultUser.email},
          ${item.followUp}, ${followDate}, ${item.proposal}
        )
      `;
    }
    console.log(`  [OK] Seeded ${commsSeed.length} communications records`);
  }

  // 4. Seed `engagements` (Pipeline deals) if empty
  if ((await countRows('engagements')) === 0 && sampleClients.length > 0) {
    const dealsSeed = [
      { idx: 0, title: 'Project 1500 — Offshore Brownfield EPCI Package', type: 'Contract', status: 'Won', est: 450000000, actual: 450000000, closeDays: -15 },
      { idx: 1, title: 'Pipeline Integrity & Cathodic Protection Upgrade', type: 'Tender', status: 'Submitted', est: 185000000, actual: 0, closeDays: 20 },
      { idx: 2, title: 'Modular Gas Processing Facility Civil Works', type: 'Proposal', status: 'Under Review', est: 320000000, actual: 0, closeDays: 35 },
      { idx: 3, title: 'Marine Terminal Logistics & Supply Base Support', type: 'Partnership', status: 'Draft', est: 120000000, actual: 0, closeDays: 45 },
      { idx: 4, title: 'Subsea Umbilical & Flowline Inspection Services', type: 'Tender', status: 'Won', est: 275000000, actual: 268000000, closeDays: -5 },
    ];
    for (const d of dealsSeed) {
      const c = sampleClients[d.idx % sampleClients.length];
      const expectedClose = new Date(Date.now() + d.closeDays * 86400000).toISOString().slice(0, 10);
      const closedDate = d.status === 'Won' ? expectedClose : null;
      await sql`
        INSERT INTO engagements (
          client_id, title, engagement_type, status, submitted_date,
          estimated_value, actual_value, expected_close_date, closed_date,
          owned_by_id, owned_by_label, notes, start_date
        ) VALUES (
          ${c.id}, ${d.title}, ${d.type}, ${d.status}, CURRENT_DATE - INTERVAL '20 days',
          ${d.est}, ${d.actual}, ${expectedClose}, ${closedDate},
          ${defaultUser.id}, ${defaultUser.display_name || defaultUser.email},
          ${`Strategic opportunity with ${c.company_name}`}, CURRENT_DATE - INTERVAL '30 days'
        )
      `;
    }
    console.log(`  [OK] Seeded ${dealsSeed.length} pipeline engagements`);
  }

  // 5. Seed `stage_history` if empty
  if ((await countRows('stage_history')) === 0 && sampleClients.length > 0) {
    for (let i = 0; i < Math.min(5, sampleClients.length); i++) {
      const c = sampleClients[i];
      const prev = c.kri_stage === 'Intimacy' ? 'Rapport' : 'Knowledge';
      const next = c.kri_stage === 'Knowledge' ? 'Rapport' : c.kri_stage;
      await sql`
        INSERT INTO stage_history (
          client_id, previous_stage, new_stage, changed_by_id, changed_by_label, notes
        ) VALUES (
          ${c.id}, ${prev}, ${next}, ${defaultUser.id},
          ${defaultUser.display_name || defaultUser.email},
          ${'Progressed following executive alignment meeting and technical qualification.'}
        )
      `;
    }
    console.log('  [OK] Seeded stage_history audit records');
  }

  // 6. Seed `automations` if empty
  if ((await countRows('automations')) === 0 && sampleClients.length > 0) {
    const autoSeed = [
      { idx: 0, title: 'Executive Birthday Greeting', type: 'Birthday Message', recurring: true, days: 14, template: 'Warm birthday wishes from the Konstructum leadership team!' },
      { idx: 1, title: 'Quarterly Tender Follow-Up Reminder', type: 'Follow-Up Reminder', recurring: false, days: 3, template: 'Follow up on submitted technical pre-qualification package.' },
      { idx: 2, title: 'Independence Day Corporate Greeting', type: 'Holiday Greeting', recurring: true, days: 60, template: 'Season greetings and best wishes from Konstructum Group.' },
    ];
    for (const a of autoSeed) {
      const c = sampleClients[a.idx % sampleClients.length];
      const triggerDate = new Date(Date.now() + a.days * 86400000).toISOString().slice(0, 10);
      await sql`
        INSERT INTO automations (
          client_id, title, automation_type, trigger_date, is_recurring, is_enabled,
          message_template, assigned_to_id
        ) VALUES (
          ${c.id}, ${a.title}, ${a.type}, ${triggerDate}, ${a.recurring}, TRUE,
          ${a.template}, ${defaultUser.id}
        )
      `;
    }
    console.log(`  [OK] Seeded ${autoSeed.length} automation rules`);
  }

  // 7. Seed `biodata` if empty
  if ((await countRows('biodata')) === 0 && sampleClients.length > 0) {
    for (let i = 0; i < Math.min(4, sampleClients.length); i++) {
      const c = sampleClients[i];
      const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim();
      await sql`
        INSERT INTO biodata (
          contact_id, full_name, preferred_name, salutation, gender,
          nationality, birth_country, birth_state, religion,
          languages_spoken, preferred_channels, preferred_contact_time,
          preferred_meeting_format, communication_formality, decision_making_style,
          record_owner_id, consent_email
        ) VALUES (
          ${c.id}, ${fullName}, ${c.first_name || fullName}, 'Engr', 'Male',
          'Nigerian', 'NG', 'Lagos', 'Christianity',
          ${['English', 'Yoruba']}, ${['Email', 'WhatsApp', 'In-Person']}, 'Morning (9am - 12pm)',
          'In-Person Executive Briefing', 'Formal', 'Analytical & Consensus-Driven',
          ${defaultUser.id}, TRUE
        )
        ON CONFLICT (contact_id) DO NOTHING
      `;
    }
    console.log('  [OK] Seeded biodata intelligence profiles');
  }

  // 8. Seed GEMS tables (`gems_interactions`, `gems_compliance`, `gems_actions`, `gems_audit_log`)
  const allClients = await sql`
    SELECT id, first_name, last_name, company_name, kri_stage FROM clients
  `;
  const gemsStakeholders = allClients
    .map((c) => ({ ...c, agency: resolveAgency(c.company_name) }))
    .filter((c) => Boolean(c.agency));

  const currentMonth = new Date().toISOString().slice(0, 7);

  if ((await countRows('gems_interactions')) === 0 && gemsStakeholders.length > 0) {
    const gemsTemplates = [
      { agency: 'NUIMS', arm: 'KCC', type: 'Meeting', cat: 'Pearl', pts: 5, inf: 75, notes: 'Technical review of upstream JV work programme and contracting strategy.', exec: true },
      { agency: 'NCDMB', arm: 'KCC', type: 'Meeting', cat: 'Pearl', pts: 5, inf: 75, notes: 'Nigerian Content Plan (NCP) certification alignment and tender clearance.', exec: false },
      { agency: 'NUPRC', arm: 'KCC', type: 'Call', cat: 'Coral', pts: 3, inf: 60, notes: 'Facilitated introduction to upstream operations permit directorate.', exec: false },
      { agency: 'NIMASA', arm: 'INTERKONSTRUCT', type: 'Meeting', cat: 'Pearl', pts: 5, inf: 75, notes: 'Cabotage waiver renewal and offshore marine vessel compliance briefing.', exec: true },
      { agency: 'NNPC', arm: 'INTERKONSTRUCT', type: 'Meeting', cat: 'Crown Jewel', pts: 1, inf: 90, notes: 'Executive sign-off briefing on brownfield engineering support package.', exec: true },
      { agency: 'NEPL', arm: 'PMT7', type: 'Email', cat: 'Coral', pts: 3, inf: 60, notes: 'Submitted technical capability dossier for field development facilities.', exec: false },
      { agency: 'NMDPRA', arm: 'KCC', type: 'Meeting', cat: 'Ruby', pts: 1, inf: 45, notes: 'Gathered early regulatory intelligence on midstream gas processing guidelines.', exec: false },
      { agency: 'ENSERV', arm: 'PMT7', type: 'Call', cat: 'Coral', pts: 3, inf: 60, notes: 'Aligned on technical services pre-qualification schedule.', exec: false },
    ];

    for (const tpl of gemsTemplates) {
      const target =
        gemsStakeholders.find((s) => s.agency === tpl.agency) || gemsStakeholders[0];
      const fullName = `${target.first_name || ''} ${target.last_name || ''}`.trim() || target.company_name;
      const followDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      await sql`
        INSERT INTO gems_interactions (
          client_id, client_name, company_key, company_name, agency, business_arm,
          interaction_type, category, final_classification, influence_percent, points,
          notes, justification, review_status, week_start, reporting_month,
          logged_by, logged_by_id, target_user, target_user_id,
          kri_classification, executive_involvement_requested,
          executive_monthly_points_at_log, follow_up_required, follow_up_date
        ) VALUES (
          ${target.id}, ${fullName}, ${String(target.company_name || '').toLowerCase()},
          ${target.company_name}, ${target.agency}, ${tpl.arm},
          ${tpl.type}, ${tpl.cat}, ${tpl.cat}, ${tpl.inf}, ${tpl.pts},
          ${tpl.notes}, ${`Strategic ${tpl.cat} engagement for ${tpl.arm} with ${target.agency}`},
          'Validated', CURRENT_DATE - INTERVAL '3 days', ${currentMonth},
          ${defaultUser.display_name || defaultUser.email}, ${defaultUser.id},
          ${defaultUser.display_name || defaultUser.email}, ${defaultUser.id},
          ${target.kri_stage || 'Rapport'}, ${tpl.exec},
          ${tpl.pts}, TRUE, ${followDate}
        )
      `;
    }
    console.log(`  [OK] Seeded ${gemsTemplates.length} GEMS interactions across the monitored agencies`);
  }

  if ((await countRows('gems_compliance')) === 0) {
    const compSeed = [
      { agency: 'NUPRC', type: 'Permit', status: 'Active', ref: 'NUPRC/OGISP/2026/A-4412', desc: 'Major Category Petroleum Industry Service Permit (OGISP)', daysToExpiry: 180 },
      { agency: 'NCDMB', type: 'Certificate', status: 'Active', ref: 'NCDMB/NCEC/2026/0891', desc: 'Nigerian Content Equipment Certificate (NCEC — Category A)', daysToExpiry: 95 },
      { agency: 'NIMASA', type: 'Registration', status: 'ExpiringSoon', ref: 'NIMASA/CAB/2025/7720', desc: 'Cabotage Offshore Vessel & Maritime Operations Registration', daysToExpiry: 21 },
      { agency: 'NMDPRA', type: 'License', status: 'Active', ref: 'NMDPRA/MGP/2026/1104', desc: 'Midstream Gas Infrastructure & Engineering Operations License', daysToExpiry: 240 },
      { agency: 'NUIMS', type: 'Obligation', status: 'UnderReview', ref: 'NUIMS/NIPEX/2026/3309', desc: 'NipeX Joint Qualification System (JQS) Annual Audit & Renewal', daysToExpiry: 14 },
    ];
    for (const item of compSeed) {
      const issueDate = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      const expiryDate = new Date(Date.now() + item.daysToExpiry * 86400000).toISOString().slice(0, 10);
      const renewalDate = new Date(Date.now() + (item.daysToExpiry - 30) * 86400000).toISOString().slice(0, 10);
      await sql`
        INSERT INTO gems_compliance (
          entity_type, entity_id, entity_name, compliance_type, status,
          issue_date, expiry_date, renewal_date, governing_body, reference_number,
          description, notes, assigned_to, assigned_to_id
        ) VALUES (
          'Agency', ${item.agency.toLowerCase()}, ${item.agency}, ${item.type}, ${item.status},
          ${issueDate}, ${expiryDate}, ${renewalDate}, ${item.agency}, ${item.ref},
          ${item.desc}, ${`Monitored under GEMS regulatory compliance schedule for ${item.agency}`},
          ${defaultUser.display_name || defaultUser.email}, ${defaultUser.id}
        )
      `;
    }
    console.log(`  [OK] Seeded ${compSeed.length} GEMS compliance & permit records`);
  }

  if ((await countRows('gems_actions')) === 0) {
    const actionsSeed = [
      { entityType: 'Agency', id: 'nimasa', name: 'NIMASA', type: 'FollowUp', prio: 'High', status: 'Open', days: 5, desc: 'Submit Cabotage renewal dossier 21 days prior to expiration.' },
      { entityType: 'Agency', id: 'nuims', name: 'NUIMS', type: 'Task', prio: 'High', status: 'InProgress', days: 3, desc: 'Complete NipeX JQS on-site audit verification package with BD Head.' },
      { entityType: 'Agency', id: 'ncdmb', name: 'NCDMB', type: 'Review', prio: 'Medium', status: 'Open', days: 10, desc: 'Schedule Pearl advocate technical endorsement session for Q3 tenders.' },
      { entityType: 'Agency', id: 'nuprc', name: 'NUPRC', type: 'FollowUp', prio: 'Medium', status: 'Open', days: 7, desc: 'Follow up with Commission office on field development permit clearance.' },
    ];
    for (const act of actionsSeed) {
      const dueDate = new Date(Date.now() + act.days * 86400000).toISOString().slice(0, 10);
      await sql`
        INSERT INTO gems_actions (
          entity_type, entity_id, entity_name, action_type, priority, status,
          due_date, assigned_to, assigned_to_id, description, source,
          created_by, created_by_id
        ) VALUES (
          ${act.entityType}, ${act.id}, ${act.name}, ${act.type}, ${act.prio}, ${act.status},
          ${dueDate}, ${defaultUser.display_name || defaultUser.email}, ${defaultUser.id},
          ${act.desc}, 'GEMS BAM Weekly Tracking',
          ${defaultUser.display_name || defaultUser.email}, ${defaultUser.id}
        )
      `;
    }
    console.log(`  [OK] Seeded ${actionsSeed.length} GEMS follow-up action items`);
  }

  if ((await countRows('gems_audit_log')) === 0) {
    await sql`
      INSERT INTO gems_audit_log (
        entity_type, entity_id, action, user_name, user_email, source, details
      ) VALUES (
        'System', 'gems-bootstrap', 'Created',
        ${defaultUser.display_name || 'Administrator'}, ${defaultUser.email},
        'seed-missing-data.mjs', 'Initialised GEMS interactions, compliance permits, and action items.'
      )
    `;
    console.log('  [OK] Seeded GEMS audit log');
  }

  console.log('\n=== Final Database Row Counts ===');
  const allTables = [
    'users', 'clients', 'companies', 'projects', 'job_titles',
    'communications', 'engagements', 'automations', 'stage_history', 'biodata',
    'gems_interactions', 'gems_compliance', 'gems_actions', 'gems_audit_log',
  ];
  for (const t of allTables) {
    console.log(`  ${String(await countRows(t)).padStart(5)}  ${t}`);
  }
  console.log('');

  await sql.end();
}

main().catch(async (err) => {
  console.error('\nFailed:', err.message || err);
  await sql.end().catch(() => {});
  process.exit(1);
});

