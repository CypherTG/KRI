/**
 * Sets environment variables on the linked Vercel project via the API.
 *
 * The CLI's `vercel env add` is interactive, which makes it awkward to script.
 * Values already present in the project are left alone unless --overwrite is
 * passed, so re-running this never clobbers a secret someone set by hand.
 *
 *   node scripts/set-env.mjs KEY=value [KEY=value …] [--overwrite]
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
  // Three targets keeps preview and production deployments working without
  // having to re-add anything.
  const targets = ['production', 'preview', 'development'];
  const results = [];
  for (const target of targets) {
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
    // The response body is returned so the caller can detect ENV_CONFLICT and
    // retry; a production failure no longer throws from here.
    results.push({ target, ok: res.ok, status: res.status, body: res.ok ? '' : await res.text() });
  }
  return results;
}

async function main() {
  console.log(`project : ${link.projectName} (${projectId})`);
  console.log(`scope   : ${scope}\n`);

  const existing = await getExisting();

  // Vercel returns one row PER TARGET, so the same key appears three times with
  // different ids. Keeping only the last one meant the delete-then-create only
  // removed a single target and the re-add came back ENV_CONFLICT every time.
  // Group by key and remember every id.
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

    if (byKey.has(name) && !overwrite) {
      const targets = (byKey.get(name).target || []).join(',');
      console.log(`  keep  ${name} (already set for: ${targets}) — pass --overwrite to replace`);
      continue;
    }

    if (byKey.has(name)) {
      const current = byKey.get(name);
      for (const id of current.ids || []) {
        await fetch(
          `https://api.vercel.com/v9/projects/${projectId}/env/${id}?teamId=${scope}`,
          { method: 'DELETE', headers },
        );
      }
    }

    // Vercel applies env deletes asynchronously, so an immediate re-add can lose
    // the race and come back ENV_CONFLICT even though the delete was issued.
    // Retrying once after a short pause is enough in practice and keeps the
    // script from aborting a whole configuration run on a transient conflict.
    let results = await create(name, value);
    if (results.some((r) => !r.ok && /ENV_CONFLICT/.test(r.body || ''))) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      results = await create(name, value);
    }

    const ok = results.every((r) => r.ok);
    if (!ok) {
      for (const r of results.filter((x) => !x.ok)) console.error(`  ${name} (${r.target}): ${r.body}`);
    }
    console.log(`  ${ok ? 'set  ' : 'PART '} ${name} -> ${results.map((r) => r.target).join(', ')}`);
    if (!ok) process.exitCode = 1;
    byKey.set(name, { key: name, target: results.filter((r) => r.ok).map((r) => r.target) });
  }

  console.log('\ncurrent project env:');
  for (const env of existing) {
    console.log(`  ${env.key} (${(env.target || []).join(',')})`);
  }
}

main().catch((error) => {
  console.error('\nFailed:', error.message || error);
  process.exit(1);
});

export { crypto };
