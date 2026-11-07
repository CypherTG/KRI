/**
 * Test launcher.
 *
 * Defaults DATABASE_URL to the local throwaway database so `npm test` works
 * with no setup, while leaving the safety rules in gems-test.ts intact: the
 * suite still refuses to run if it has been handed a hosted production URL, and
 * it never reads DATABASE_URL from a file, because `vercel blob connect`
 * rewrites .env.local with the real one.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const LOCAL = 'postgres://postgres:kairos@127.0.0.1:55555/kairos';

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

const child = spawn('npx', ['tsx', 'scripts/gems-test.ts'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
