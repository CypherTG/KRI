import fs from 'fs';
import postgres from 'postgres';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL=([^\r\n]+)/);
if (!match) {
  console.error('No DATABASE_URL found in .env.local');
  process.exit(1);
}
const dbUrl = match[1].replace(/["']/g, '').trim();
const sql = postgres(dbUrl, { ssl: 'require', max: 1 });

async function run() {
  // 1. Remove bellomuyis247, bellogbolahan247, etc.
  const deleted = await sql`
    DELETE FROM users 
     WHERE lower(email) LIKE '%bello%@gmail.com' 
    RETURNING id, email
  `;
  console.log('Removed gmail admin accounts:', deleted);

  // 2. Set mbello@konstructum.com as admin, active, and verified
  const updated = await sql`
    UPDATE users 
       SET is_admin = true,
           is_active = true,
           job_title = 'Super Administrator',
           title = 'Muyiwa Bello',
           display_name = 'Muyiwa Bello',
           email_verified_at = now()
     WHERE lower(email) = 'mbello@konstructum.com'
    RETURNING id, email, display_name, is_admin, is_active
  `;
  console.log('Updated mbello@konstructum.com:', updated);

  const remaining = await sql`SELECT id, email, display_name, is_admin, is_active FROM users`;
  console.log('Remaining users in database:', remaining);
  await sql.end();
}

run().catch((err) => {
  console.error('Error reset:', err);
  process.exit(1);
});
