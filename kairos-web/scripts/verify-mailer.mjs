/**
 * Verifies the configured mail transport can actually send, before it is wired
 * into registration.
 *
 *   set "SMTP_HOST=smtp.gmail.com" & set "SMTP_USER=…" & set "SMTP_PASSWORD=…" & node scripts/verify-mailer.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

for (const file of ['.env.local', '.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { verifyMailer, mailerConfig } = await import(
  pathToFileURL(path.resolve('api/_lib/mailer.ts')).href
);

const config = mailerConfig();
console.log('\n  configured transport :', config.transport);
console.log('  from                 :', config.from);
if (config.transport === 'smtp') {
  console.log('  host                 :', process.env.SMTP_HOST);
  console.log('  port                 :', process.env.SMTP_PORT || '587');
  console.log('  user                 :', process.env.SMTP_USER);
  console.log('  password present     :', Boolean(process.env.SMTP_PASSWORD));
  console.log(`  password length       : ${String(process.env.SMTP_PASSWORD || '').replace(/\s/g, '').length} characters`);
} else {
  console.log('  unsafe in production :', config.unsafeInProduction);
}

const result = await verifyMailer();
console.log('\n  result               :', result.ok ? 'OK' : 'FAILED');
console.log('  detail               :', result.detail);
console.log('');

process.exit(result.ok ? 0 : 1);
