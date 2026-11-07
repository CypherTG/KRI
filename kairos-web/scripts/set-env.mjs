/**
 * Sets environment variables on the linked Vercel project via the API.
 *
 * The CLI's `vercel env add` is interactive, which makes it awkward to script.
 * Values already present in the project are left alone unless --overwrite is
 * passed, so re-running this never clobbers a secret someone set by hand.
 *
 *   node scripts/set-env.mjs KEY=value [KEY=value …] [--overwrite]
 *
 * Two things this handles that a naive script gets wrong:
 *
 *  · Vercel returns one row PER TARGET, so the same key appears three times
 *    with different ids. Grouping by key and updating every id is what keeps all
 *    three targets in step.
 *
 *  · Existing variables are PATCHed, not deleted and re-added. Deleting races
 *    Vercel's asynchronous env propagation, so the re-add comes back
 *    ENV_CONFLICT and the variable ends up configured for only some targets —
 *    which looks correct and is not.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const CRED_DIRS = [
  path.join(process.env.APPDATA || '', 'xdg.data', 'com.vercel.cli'),
  path.join(os.homedir(), '.local', 'share', 'com.vercel.cli'),
  path.join(os.homedir(), '.vercel'),
];

function loadToken() {
  for (const dir of CRED_DIRS) {
    const file = path.join(dir, 'auth.json');
    if (!fs.existsSync(file)) continue;
    const auth = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (auth.token) return auth.token;
    const nested = Object.values(auth).find((v) => v && typeof v === 'object' && v.token);
    if (nested) return nested.token;
  }
  throw new Error('No Vercel credentials found. Run: npx vercel login');
}

function readProjectLink() {
  const file = path.join(process.cwd(), '.vercel', 'project.json');
  if (!fs.existsSync(file)) throw new Error('Project is not linked. Run: npx vercel link');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const token = loadToken();
const link = readProjectLink();
const projectId = link.projectId;
const scope = link.orgId;

if (!projectId) {
  throw new Error('The linked project has no projectId. Re-run: npx vercel link');
}

const overwrite = process.argv.includes('--overwrite');
const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

if (!args.length) {
  console.error('Usage: node scripts/set-env.mjs KEY=value [KEY=value …] [--overwrite]');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const TARGETS = ['production', 'preview', 'development'];

async function getExisting() {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${scope}&decrypt=true`,
    { headers },
  );
  if (!res.ok) throw new Error(`Could not read env (${res.status}): ${await res.text()}`);
  const body = await res.json();
  return body.envs || [];
}

async function create(name, value) {
  const results = [];
  for (const target of TARGETS) {
    const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${scope}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        key: name,
        value,
        // Production is encrypted at rest; the others are readable for tooling.
        type: target === 'production' ? 'encrypted' : 'plain',
        target: [target],
      }),
    });
    results.push({ target, ok: res.ok, status: res.status, body: res.ok ? '' : await res.text() });
  }
  return results;
}

async function main() {
  console.log(`project : ${link.orgId ? '' : ''}${path.basename(process.cwd())} (${projectId})`);
  console.log(`scope   : ${scope}\n`);

  const existing = await getExisting();

  const byKey = new Map();
  for (const env of existing) {
    const entry = byKey.get(env.key) || { key: env.key, ids: [], target: [] };
    entry.ids.push(env.id);
    for (const target of env.target || ['production']) {
      if (!entry.target.includes(target)) entry.target.push(target);
    }
    byKey.set(env.key, entry);
  }

  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq === -1) {
      console.error(`  skip (not KEY=value): ${arg}`);
      continue;
    }
    const name = arg.slice(0, eq);
    const value = arg.slice(eq + 1);
    const found = byKey.get(name);

    if (found && !overwrite) {
      console.log(`  keep  ${name} (already set for: ${found.target.join(',')}) — pass --overwrite to replace`);
      continue;
    }

    if (found?.ids?.length) {
      // Update each existing row in place.
      const failures = [];
      for (const id of found.ids) {
        const res = await fetch(
          `https://api.vercel.com/v9/projects/${projectId}/env/${id}?teamId=${scope}`,
          { method: 'PATCH', headers, body: JSON.stringify({ value }) },
        );
        if (!res.ok) failures.push(await res.text());
      }

      // A target can be missing a row entirely — a partially failed earlier run
      // leaves exactly that, and it is invisible unless you check each target.
      const missing = TARGETS.filter((target) => !found.target.includes(target));
      const created = [];
      for (const target of missing) {
        const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${scope}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            key: name,
            value,
            type: target === 'production' ? 'encrypted' : 'plain',
            target: [target],
          }),
        });
        created.push({ target, ok: res.ok, body: res.ok ? '' : await res.text() });
      }
      const createdFailures = created.filter((c) => !c.ok);

      if (!failures.length && !createdFailures.length) {
        const summary = [...found.target, ...created.map((c) => c.target)].join(', ');
        console.log(`  set   ${name} -> ${summary} (updated in place${created.length ? `, added ${created.length} target(s)` : ''})`);
        continue;
      }

      for (const failure of failures) console.error(`  ${name}: ${failure}`);
      for (const failure of createdFailures) console.error(`  ${name} (${failure.target}): ${failure.body}`);
      console.error(`  could not fully configure ${name}; leaving what is there untouched rather than`);
      console.error('  deleting a working secret and risking ending up with neither.');
      process.exitCode = 1;
      continue;
    }

    const results = await create(name, value);
    const ok = results.every((r) => r.ok);
    if (!ok) for (const r of results.filter((x) => !x.ok)) console.error(`  ${name} (${r.target}): ${r.body}`);
    console.log(`  ${ok ? 'set  ' : 'PART '} ${name} -> ${results.map((r) => r.target).join(', ')}`);
    if (!ok) process.exitCode = 1;
  }

  console.log('\ncurrent project env:');
  for (const [key, entry] of [...byKey.entries()].sort()) {
    console.log(`  ${key} (${entry.target.join(',')})`);
  }
}

main().catch((error) => {
  console.error('\nFailed:', error.message || error);
  process.exit(1);
});

export { crypto };
