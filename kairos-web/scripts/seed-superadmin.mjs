import fs from 'fs';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL=([^\r\n]+)/);
if (!match) {
  console.error('No DATABASE_URL found in .env.local');
  process.exit(1);
}
const dbUrl = match[1].replace(/["']/g, '').trim();
const sql = postgres(dbUrl, { ssl: 'require', max: 1 });

async function run() {
  const email = 'bellogbolahan247@gmail.com';
  const password = 'KairosAdmin2026!';
  const hash = await bcrypt.hash(password, 10);
  
  await sql`UPDATE users 
    SET password_hash = ${hash}, 
        is_admin = true, 
        is_active = true, 
        display_name = 'Gbolahan Bello', 
        title = 'Gbolahan Bello', 
        job_title = 'Super Administrator',
        email_verified_at = now(),
        require_token_every_signin = false
    WHERE lower(email) = ${email.toLowerCase()}`;
  console.log('Updated superadmin account with verified status');
  
  const user = await sql`SELECT id, email, display_name, is_admin, is_active, email_verified_at FROM users WHERE lower(email) = ${email.toLowerCase()}`;
  console.log('Superadmin record:', user);
  await sql.end();
}

run().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
