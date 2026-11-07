/**
 * Applies db/schema.sql to the configured Postgres database.
 *
 *   DATABASE_URL="postgresql://…" npm run db:push
 *
 * The schema is written to be idempotent (CREATE TABLE IF NOT EXISTS, CREATE
 * OR REPLACE, DROP TRIGGER IF EXISTS), so running it repeatedly is safe and
 * will not touch existing data.
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

for (const file of ['.env.local', '.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, k, rawVal] = m;
    const val = rawVal.replace(/^["']|["']$/g, '');
    if (!process.env[k] && val !== '') process.env[k] = val;
  }
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

/**
 * Both schema files are applied, in order.
 *
 * GEMS shares KAIROS's database, so the shared tables (users, clients,
 * companies, …) must exist before the GEMS tables that reference them. Both
 * files are idempotent, so running this repeatedly is safe.
 */
const SCHEMA_FILES = [path.resolve('db/schema.sql'), path.resolve('db/gems-schema.sql')];
const seedFile = path.resolve('db/seed.sql');
const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: /neon\.tech|neon\.build|supabase\./i.test(url) ? 'require' : undefined,
  onnotice: () => {},
});

async function main() {
  for (const sqlFile of SCHEMA_FILES) {
    const schema = fs.readFileSync(sqlFile, 'utf8');
    console.log(`Applying ${path.relative(process.cwd(), sqlFile)} …`);
    await sql.unsafe(schema);
    console.log('  applied');
  }

  const tables = await sql.unsafe(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  console.log(`  ${tables.length} tables: ${tables.map((t) => t.table_name).join(', ')}`);

  if (process.argv.includes('--seed') && fs.existsSync(seedFile)) {
    const email = String(process.env.ADMIN_EMAIL || 'onechief011@gmail.com').trim();
    // Shell syntax is a trap here: `set ADMIN_PASSWORD=secret && node …` in
    // cmd.exe captures a trailing space, which would silently make the admin
    // password something the operator can never type. Trim, and refuse
    // anything that only differs by surrounding whitespace.
    const rawPassword = process.env.ADMIN_PASSWORD ?? '';
    const password = rawPassword.trim();

    if (!password) {
      console.log('\nSkipping seed: set ADMIN_PASSWORD to create the founding administrator.');
      console.log('  ADMIN_PASSWORD="your-password" npm run db:push -- --seed');
    } else {
      if (rawPassword !== password) {
        console.log('\n  note: ADMIN_PASSWORD had surrounding whitespace and was trimmed.');
      }
      if (password.length < 12) {
        console.warn('  warning: that password is under 12 characters. Use something stronger for a live intranet.');
      }

      const bcrypt = (await import('bcryptjs')).default;
      const hash = await bcrypt.hash(password, 10);
      const displayName = process.env.ADMIN_NAME || 'KAIROS Administrator';

      // seed.sql is written for psql, where :'var' is substituted with a quoted
      // literal. Rewrite those to real bind parameters so the same file can be
      // executed through the driver.
      const seed = fs
        .readFileSync(seedFile, 'utf8')
        .replace(/^--.*$/gm, '')
        .replace(/'admin_email'|:['"]?admin_email['"]?/g, '$1')
        .replace(/'admin_hash'|:['"]?admin_hash['"]?/g, '$2')
        .replace(/'admin_name'|:['"]?admin_name['"]?/g, '$3');

      console.log(`\nSeeding founding administrator ${email} …`);
      await sql.unsafe(seed, [email, hash, displayName]);

      // Fail loudly here rather than leaving a sign-in that cannot succeed.
      const stored = await sql`SELECT password_hash FROM users WHERE lower(email) = lower(${email})`;
      const row = stored[0];
      const ok = row ? await bcrypt.compare(password, String(row.password_hash)) : false;
      if (!ok) {
        throw new Error('The seeded password does not verify against the stored hash. Aborting.');
      }
      console.log(`  done — ${email} verified; sign in with the password you supplied`);
    }
  }

  await sql.end();
}

main().catch(async (error) => {
  console.error('\nFailed:', error.message || error);
  await sql.end().catch(() => {});
  process.exit(1);
});
