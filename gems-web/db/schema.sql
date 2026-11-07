-- ============================================================================
--  KAIROS — Neon Postgres schema
--  1:1 translation of the 12 SharePoint lists that powered the SPFx app.
--
--  Design notes
--  ------------
--  * Every table keeps a stable `id` TEXT primary key. SharePoint used an
--    auto-increment int that the UI stringified (`ID: String(item.Id)`), so a
--    TEXT id keeps every existing `client.ID`-style code path valid while
--    letting us import SharePoint rows without renumbering.
--  * SharePoint "Person or Group" columns become `*_id` TEXT FKs to `users`.
--  * SharePoint "Lookup" columns become `client_id` TEXT FKs to `clients`.
--  * SharePoint choice columns become TEXT with a CHECK constraint.
--  * DateOnly columns stay DATE; DateTime columns stay TIMESTAMPTZ.
--  * `business_arms` / `languages_spoken` etc. are TEXT[] (SharePoint
--    MultiChoice / JSON-in-multiline-note respectively).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
--  users — replaces KRI_Users + the M365 site-user directory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email           TEXT UNIQUE,
  password_hash   TEXT,
  display_name    TEXT,
  title           TEXT,             -- legacy KRI_Users.Title
  job_title       TEXT,
  department      TEXT,             -- Konstructum | PMT7 Integrated | Interkonstruct | NGneered Projects
  target_clients  INTEGER NOT NULL DEFAULT 0,
  target_deals    INTEGER NOT NULL DEFAULT 0,
  profile_photo   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  join_date       DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_active_idx    ON users (is_active);

-- The Blob pathname of the profile photo, kept alongside the public URL so a
-- replacement can delete the file it supersedes instead of orphaning it.
-- Added idempotently: the table already exists in deployed databases, so
-- CREATE TABLE IF NOT EXISTS above would not introduce this column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_path TEXT;

-- ── Email ownership verification ─────────────────────────────────────────────
-- The five columns are shared with KAIROS and are applied by the KAIROS
-- migration. They are repeated here so this project can be brought up against an
-- empty database on its own; both are idempotent and declare the same thing.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at             TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash      TEXT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_sent_count      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS require_token_every_signin   BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
--  clients — replaces KRI_Clients (the master registry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  first_name            TEXT NOT NULL DEFAULT '',
  last_name             TEXT NOT NULL DEFAULT '',
  gender                TEXT,
  email                 TEXT,
  phone                 TEXT,
  company_name          TEXT,
  business_arms         TEXT[] NOT NULL DEFAULT '{}',
  job_title             TEXT,
  project_name          TEXT,
  kri_stage             TEXT NOT NULL DEFAULT 'Knowledge'
                          CHECK (kri_stage IN ('Knowledge','Rapport','Intimacy')),
  linkedin_url          TEXT,
  instagram_handle      TEXT,
  secondary_contact_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  primary_contact_id    TEXT REFERENCES users(id) ON DELETE SET NULL,  -- KCCContactPerson
  birthday_date         DATE,
  date_registered       DATE NOT NULL DEFAULT CURRENT_DATE,
  last_contact_date     TIMESTAMPTZ,
  photo_url             TEXT,
  industry              TEXT,
  notes                 TEXT,
  needs_opportunity     TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id         TEXT REFERENCES users(id) ON DELETE SET NULL,   -- SharePoint AuthorId
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_stage_idx     ON clients (kri_stage);
CREATE INDEX IF NOT EXISTS clients_company_idx   ON clients (lower(company_name));
CREATE INDEX IF NOT EXISTS clients_primary_idx   ON clients (primary_contact_id);
CREATE INDEX IF NOT EXISTS clients_secondary_idx ON clients (secondary_contact_id);
CREATE INDEX IF NOT EXISTS clients_email_idx     ON clients (lower(email));
CREATE INDEX IF NOT EXISTS clients_registered_idx ON clients (date_registered DESC);

-- ---------------------------------------------------------------------------
--  communications — replaces KRI_Communications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS communications (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id            TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject              TEXT,
  communication_type   TEXT,
  notes                TEXT,
  communication_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_by_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  logged_by_label      TEXT,        -- denormalised so history survives user deletion
  follow_up_required   BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_date       DATE,
  proposal_submitted   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS communications_client_idx ON communications (client_id);
CREATE INDEX IF NOT EXISTS communications_date_idx   ON communications (communication_date DESC);
CREATE INDEX IF NOT EXISTS communications_followup_idx ON communications (follow_up_date)
  WHERE follow_up_required;

-- ---------------------------------------------------------------------------
--  engagements — replaces KRI_Engagements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagements (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id            TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title                TEXT,
  engagement_type      TEXT,
  status               TEXT NOT NULL DEFAULT 'Draft',
  submitted_date       DATE,
  estimated_value      NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_value         NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_close_date  DATE,
  closed_date          DATE,
  owned_by_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  owned_by_label       TEXT,
  notes                TEXT,
  start_date           DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engagements_client_idx ON engagements (client_id);
CREATE INDEX IF NOT EXISTS engagements_status_idx  ON engagements (status);
CREATE INDEX IF NOT EXISTS engagements_owner_idx   ON engagements (owned_by_id);
CREATE INDEX IF NOT EXISTS engagements_close_idx   ON engagements (expected_close_date);

-- ---------------------------------------------------------------------------
--  automations — replaces KRI_Automations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automations (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id          TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title              TEXT,
  automation_type    TEXT,
  trigger_date       DATE,
  is_recurring       BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  message_template   TEXT,
  last_sent_date     DATE,
  assigned_to_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automations_client_idx ON automations (client_id);
CREATE INDEX IF NOT EXISTS automations_trigger_idx ON automations (trigger_date)
  WHERE is_enabled;

-- ---------------------------------------------------------------------------
--  stage_history — replaces KRI_StageHistory (append-only audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage_history (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id       TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  previous_stage  TEXT,
  new_stage       TEXT,
  changed_by_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  changed_by_label TEXT,
  changed_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS stage_history_client_idx ON stage_history (client_id);
CREATE INDEX IF NOT EXISTS stage_history_date_idx   ON stage_history (changed_date DESC);

-- ---------------------------------------------------------------------------
--  companies / projects / job_titles — canonical lookup registries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_key    TEXT UNIQUE NOT NULL,
  company_name   TEXT NOT NULL,
  canonical_name TEXT,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'Active'
                   CHECK (status IN ('Active','Inactive','Archived')),
  contact_count  INTEGER NOT NULL DEFAULT 0,
  latest_activity DATE,
  acumen_summary TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_key TEXT UNIQUE NOT NULL,
  project_name TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Active'
                CHECK (status IN ('Active','Inactive')),
  sort_order  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_titles (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_title_key TEXT UNIQUE NOT NULL,
  job_title_name TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Active'
                  CHECK (status IN ('Active','Inactive')),
  sort_order    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
--  company_acumen — one metadata row per company; the file itself is Blob
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_acumen (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_key  TEXT NOT NULL,
  company_name TEXT,
  file_name    TEXT,
  file_url     TEXT,
  blob_path    TEXT,
  content_type TEXT,
  size_bytes   BIGINT,
  notes        TEXT,
  uploaded_by_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_label TEXT,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_acumen_key_idx ON company_acumen (company_key);
CREATE INDEX IF NOT EXISTS company_acumen_at_idx  ON company_acumen (uploaded_at DESC);

-- ---------------------------------------------------------------------------
--  biodata — replaces KRI_Biodata (~40 fields, 7 modules)
--  Multi-value text fields are TEXT[]; the UI reads/writes them as JSON.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biodata (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contact_id             TEXT UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Module 1 · Identity
  full_name              TEXT,
  preferred_name         TEXT,
  salutation             TEXT,
  gender                 TEXT,
  date_of_birth          DATE,
  profile_photo_url      TEXT,
  photo_blob_path        TEXT,
  record_status          TEXT NOT NULL DEFAULT 'Active'
                           CHECK (record_status IN ('Active','Inactive','Archived')),
  record_owner_id        TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- Module 2 · Personal origin
  nationality            TEXT,
  birth_country          TEXT,
  birth_state            TEXT,
  hometown               TEXT,
  ethnicity              TEXT,
  religion               TEXT,
  languages_spoken       TEXT[] NOT NULL DEFAULT '{}',

  -- Module 3 · Education
  education              TEXT[] NOT NULL DEFAULT '{}',
  certifications         TEXT[] NOT NULL DEFAULT '{}',

  -- Module 4 · Career
  work_history           TEXT[] NOT NULL DEFAULT '{}',
  board_positions        TEXT[] NOT NULL DEFAULT '{}',

  -- Module 5 · Communication preferences
  preferred_channels     TEXT[] NOT NULL DEFAULT '{}',
  preferred_contact_time TEXT,
  preferred_meeting_format TEXT,
  communication_formality  TEXT,
  gatekeeper_name        TEXT,
  gatekeeper_phone       TEXT,
  comms_notes            TEXT,

  -- Module 6 · Intelligence
  personal_interests     TEXT[] NOT NULL DEFAULT '{}',
  motivators             TEXT[] NOT NULL DEFAULT '{}',
  decision_making_style  TEXT,
  referral_source        TEXT,
  known_associates       TEXT[] NOT NULL DEFAULT '{}',
  sensitivity_flags      TEXT[] NOT NULL DEFAULT '{}',
  account_notes          TEXT,

  -- Module 7 · Consent & audit
  consent_email          BOOLEAN NOT NULL DEFAULT FALSE,
  consent_sms            BOOLEAN NOT NULL DEFAULT FALSE,
  consent_date           DATE,
  data_source            TEXT DEFAULT 'Manual',
  created_date           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_date     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deletion_requested     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS biodata_contact_idx ON biodata (contact_id);

-- ---------------------------------------------------------------------------
--  contact_access_requests — the owner-approval workflow
--  (built in the SPFx app but short-circuited by canViewClient()===true)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_access_requests (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id       TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name     TEXT,
  company_name    TEXT,
  requester_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  requester_key   TEXT NOT NULL,
  requester_name  TEXT,
  requester_email TEXT,
  owner_key       TEXT,
  owner_name      TEXT,
  status          TEXT NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','Approved','Declined','Expired')),
  reason          TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  response_by     TEXT
);
CREATE INDEX IF NOT EXISTS access_requests_requester_idx ON contact_access_requests (lower(requester_key));
CREATE INDEX IF NOT EXISTS access_requests_client_idx    ON contact_access_requests (client_id);
CREATE INDEX IF NOT EXISTS access_requests_status_idx    ON contact_access_requests (status);

-- ---------------------------------------------------------------------------
--  updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','clients','engagements','automations',
                           'companies','projects','job_titles','biodata']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;
