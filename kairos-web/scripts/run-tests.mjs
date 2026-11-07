/**
 * Test launcher.
 *
 * Defaults DATABASE_URL to the local throwaway database so the suites work with
 * no setup, while leaving their own safety rules intact: both refuse to run if
 * they have been handed a hosted production URL, and neither reads
 * DATABASE_URL from a file, because `vercel blob connect` rewrites .env.local
 * with the real one.
 *
 *   node scripts/run-tests.mjs                  # the main API suite
 *   node scripts/run-tests.mjs verification     # the email-verification suite
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const LOCAL = 'postgres://postgres:kairos@127.0.0.1:55555/kairos';

const SUITES = {
  '': 'scripts/smoke.ts',
  verification: 'scripts/verification-test.ts',
};

const target = SUITES[(process.argv[2] || '').trim()];
if (!target) {
  console.error(`\n  Unknown suite "${process.argv[2]}". Known: ${Object.keys(SUITES).filter(Boolean).join(', ')}\n`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = LOCAL;
  console.log(`\n  Using the local throwaway database: ${LOCAL}`);
  console.log('  (the suite TRUNCATES it — start it with: docker run -d --name kairos-test-db');
  console.log('   -p 55555:5432 -e POSTGRES_PASSWORD=kairos -e POSTGRES_DB=kairos postgres:16)\n');
} else {
  console.log(`\n  Using DATABASE_URL from the environment.\n`);
}

if (!existsSync('node_modules')) {
  console.error('\n  Dependencies are missing. Run `npm install` first.\n');
  process.exit(1);
}

const child = spawn('npx', ['tsx', target], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
