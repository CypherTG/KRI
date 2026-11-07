-- ============================================================================
--  GEMS — Government / regulator Engagement Management System
--  Applies to the SAME database KAIROS uses.
--
--  GEMS deliberately does NOT have its own contact or company tables. A
--  stakeholder in GEMS *is* a contact in KAIROS, and an agency *is* a company:
--  the two products were conjoined from the start and must never drift into
--  separate copies of the same organisation. So `clients` and `companies` are
--  read (and shared) rather than duplicated, and everything GEMS owns is the
--  four tables below.
--
--  Scope: contacts are only eligible for GEMS when their company resolves to one
--  of the eight monitored agencies. That rule lives in api/_lib/gemsScope.ts
--  and is enforced in SQL on every read — the browser is not trusted.
--
--  Every statement is idempotent so this can be re-applied safely.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  gems_interactions — the core log. One row per engagement with a stakeholder.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gems_interactions (
  id                              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id                        TEXT REFERENCES clients(id) ON DELETE CASCADE,
  client_name                      TEXT,
  company_key                      TEXT,
  company_name                     TEXT,
  agency                           TEXT,          -- resolved to one of the eight
  business_arm                     TEXT,
  interaction_type                 TEXT NOT NULL
                                    CHECK (interaction_type IN ('Meeting','Call','Email','Note')),
  category                         TEXT NOT NULL
                                    CHECK (category IN ('Crown Jewel','Pearl','Coral','Ruby')),
  final_classification             TEXT,
  influence_percent                NUMERIC(5,2),
  points                           INTEGER NOT NULL DEFAULT 0,
  notes                            TEXT,
  justification                    TEXT,
  review_status                    TEXT NOT NULL DEFAULT 'Submitted'
                                    CHECK (review_status IN ('Submitted','Pending Review','Validated','Rejected')),
  week_start                       DATE,
  reporting_month                  TEXT,          -- YYYY-MM
  logged_by                        TEXT,
  logged_by_id                     TEXT REFERENCES users(id) ON DELETE SET NULL,
  logged_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_user                      TEXT,
  target_user_id                   TEXT REFERENCES users(id) ON DELETE SET NULL,
  kri_classification               TEXT,
  executive_involvement_requested  BOOLEAN NOT NULL DEFAULT FALSE,
  executive_monthly_points_at_log  INTEGER NOT NULL DEFAULT 0,
  follow_up_required               BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_date                   DATE,
  scheduled_date                   TIMESTAMPTZ,
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gems_interactions_client_idx  ON gems_interactions (client_id);
CREATE INDEX IF NOT EXISTS gems_interactions_agency_idx  ON gems_interactions (lower(agency));
CREATE INDEX IF NOT EXISTS gems_interactions_logged_idx  ON gems_interactions (logged_at DESC);
CREATE INDEX IF NOT EXISTS gems_interactions_review_idx  ON gems_interactions (review_status);
CREATE INDEX IF NOT EXISTS gems_interactions_month_idx   ON gems_interactions (reporting_month);

-- ---------------------------------------------------------------------------
--  gems_compliance — permits, licences, obligations and regulatory filings.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gems_compliance (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  entity_type         TEXT NOT NULL CHECK (entity_type IN ('Stakeholder','Agency')),
  entity_id           TEXT NOT NULL,
  entity_name         TEXT,
  compliance_type     TEXT NOT NULL
                        CHECK (compliance_type IN ('Permit','License','Obligation','Certificate','Filing','Registration')),
  status              TEXT NOT NULL DEFAULT 'Active'
                        CHECK (status IN ('Active','Expired','Pending','Cancelled','ExpiringSoon','UnderReview')),
  issue_date          DATE,
  expiry_date         DATE,
  renewal_date        DATE,
  governing_body      TEXT,
  reference_number    TEXT,
  description         TEXT,
  notes               TEXT,
  assigned_to         TEXT,
  assigned_to_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  documents_json      TEXT,          -- JSON array of {name,url,size}
  document_blob_path  TEXT,          -- Blob pathname, so a replacement can delete it
  last_checked_date   DATE,
  alert_sent          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gems_compliance_entity_idx ON gems_compliance (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS gems_compliance_status_idx ON gems_compliance (status);
CREATE INDEX IF NOT EXISTS gems_compliance_expiry_idx ON gems_compliance (expiry_date)
  WHERE expiry_date IS NOT NULL;

-- ---------------------------------------------------------------------------
--  gems_actions — follow-ups and tasks arising from any GEMS entity.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gems_actions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  entity_type   TEXT NOT NULL
                  CHECK (entity_type IN ('Stakeholder','Agency','Interaction','Compliance','System')),
  entity_id     TEXT NOT NULL,
  entity_name   TEXT,
  action_type   TEXT NOT NULL
                  CHECK (action_type IN ('FollowUp','Task','Reminder','Approval','Review','Notification')),
  priority      TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
  status        TEXT NOT NULL DEFAULT 'Open'
                  CHECK (status IN ('Open','InProgress','Completed','Cancelled','Deferred')),
  due_date      DATE,
  completed_date DATE,
  assigned_to   TEXT,
  assigned_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  description   TEXT,
  source        TEXT,
  source_id     TEXT,
  outcome       TEXT,
  created_by    TEXT,
  created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gems_actions_entity_idx   ON gems_actions (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS gems_actions_status_idx   ON gems_actions (status);
CREATE INDEX IF NOT EXISTS gems_actions_assigned_idx ON gems_actions (assigned_to_id);
CREATE INDEX IF NOT EXISTS gems_actions_due_idx      ON gems_actions (due_date)
  WHERE status IN ('Open','InProgress');

-- ---------------------------------------------------------------------------
--  gems_audit_log — append-only trail across every GEMS entity.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gems_audit_log (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL
                CHECK (action IN ('Created','Updated','Deleted','Viewed','Exported','Approved','Rejected')),
  field_name  TEXT,
  old_value   TEXT,
  new_value   TEXT,
  user_name   TEXT,
  user_email  TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      TEXT,
  details     TEXT
);
CREATE INDEX IF NOT EXISTS gems_audit_entity_idx ON gems_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS gems_audit_time_idx   ON gems_audit_log (timestamp DESC);

-- ---------------------------------------------------------------------------
--  touch_updated_at — shared by the GEMS tables.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['gems_interactions','gems_compliance','gems_actions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;
