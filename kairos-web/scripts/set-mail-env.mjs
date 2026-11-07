/**
 * Applies the mail configuration to a Vercel project.
 *
 * Reads SMTP_* from the environment so the app password is never written to a
 * file in the repository. Refuses to run without them: a half-configured mailer
 * is worse than an unconfigured one, because registration would create accounts
 * and then fail to deliver their codes.
 *
 *   set "SMTP_USER=…" & set "SMTP_PASSWORD=…" & node scripts/set-mail-env.mjs
 */
import { spawnSync } from 'node:child_process';

const REQUIRED = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'];
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`\n  Missing: ${missing.join(', ')}`);
  console.error('  Refusing to configure a partial mailer.\n');
  process.exit(1);
}

const values = [
  ['SMTP_HOST', process.env.SMTP_HOST],
  ['SMTP_PORT', process.env.SMTP_PORT || '587'],
  ['SMTP_USER', process.env.SMTP_USER],
  // Spaces are stripped: Gmail accepts the compact form, and a value with spaces
  // is easy to mangle when passed through a shell.
  ['SMTP_PASSWORD', String(process.env.SMTP_PASSWORD).replace(/\s+/g, '')],
  // The sending address is the authenticated mailbox — that is not configurable.
  // konstructum.com's SPF is `include:secureserver.net -all`, so a message
  // claiming that From domain while authenticated to Gmail has no valid SPF or
  // DKIM and is junked or rejected. Branding is done with the display name, and
  // replies are routed to the business inbox.
  ['SMTP_FROM', process.env.SMTP_FROM || `Konstructum <${process.env.SMTP_USER}>`],
  ['SMTP_REPLY_TO', process.env.SMTP_REPLY_TO || ''],
  ['MAIL_APP_NAME', process.env.MAIL_APP_NAME || 'KAIROS'],
  ['ALLOW_CONSOLE_MAIL', 'false'],
];

for (const [key, value] of values) {
  const result = spawnSync(
    process.execPath,
    ['scripts/set-env.mjs', `${key}=${value}`, '--overwrite'],
    { stdio: 'inherit', shell: false },
  );
  if (result.status !== 0) {
    console.error(`\n  Failed to set ${key}. Aborting.\n`);
    process.exit(1);
  }
}

console.log('\n  Mail transport configured. The console fallback is disabled.\n');
