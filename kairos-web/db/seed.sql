-- ============================================================================
--  KAIROS — bootstrap seed
--
--  Creates the founding administrator. Pure SQL with bound parameters, so the
--  same file works through psql and through the application's own migration
--  script.
--
--    psql   -v admin_email=... -v admin_hash=...   -f db/seed.sql
--    node   scripts/apply-schema.mjs --seed        (preferred; hashes for you)
-- ============================================================================

INSERT INTO users (email, password_hash, display_name, title, job_title, department, is_admin, is_active, email_verified_at)
VALUES (
  :'admin_email',
  :'admin_hash',
  :'admin_name',
  :'admin_name',
  'Administrator',
  'Konstructum',
  TRUE,
  TRUE,
  now()
)
ON CONFLICT (email) DO UPDATE
  SET is_admin          = TRUE,
      is_active         = TRUE,
      title             = EXCLUDED.title,
      display_name      = EXCLUDED.display_name,
      job_title         = EXCLUDED.job_title,
      department        = COALESCE(NULLIF(users.department, ''), EXCLUDED.department),
      email_verified_at = COALESCE(users.email_verified_at, now()),
      -- Re-running the seed must actually reset the password. Without this,
      -- a second run would leave the previous hash in place and the operator
      -- would believe they had changed it when they had not.
      password_hash     = EXCLUDED.password_hash;
