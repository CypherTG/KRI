import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

const SUPERADMIN_EMAIL = 'bellogbolahan247@gmail.com';
const SUPERADMIN_PASSWORD = 'KairosAdmin2026!';

test.describe('Superadmin Console & Root Security Governance', () => {
  test('Non-superadmin is strictly rejected from /api/superadmin with 403 Forbidden', async ({ request }) => {
    // Sign in as standard user mbello@konstructum.com
    await login(request);

    const res = await request.get('/api/superadmin');
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Access denied');
  });

  test('Superadmin can authenticate and access system telemetry', async ({ request }) => {
    // Authenticate as root superadmin
    const loginRes = await request.post('/api/auth/login', {
      data: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD },
    });
    expect(loginRes.status()).toBe(200);

    const telemetryRes = await request.get('/api/superadmin');
    expect(telemetryRes.status()).toBe(200);

    const data = await telemetryRes.json();
    expect(data.superadmin).toBe(SUPERADMIN_EMAIL);
    expect(data.systemStatus).toBe('Operational');
    expect(Array.isArray(data.users)).toBe(true);
    expect(data.users.length).toBeGreaterThanOrEqual(2);
    expect(data.counts.clients).toBeGreaterThan(0);
    expect(data.storage).toHaveProperty('blobConfigured');
  });

  test('Superadmin can promote and manage administrators via PATCH /api/superadmin', async ({ request }) => {
    // Log in as root superadmin
    await request.post('/api/auth/login', {
      data: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD },
    });

    // Fetch user list to get target user
    const res = await request.get('/api/superadmin');
    const data = await res.json();
    const targetUser = data.users.find((u: any) => u.email === 'mbello@konstructum.com');
    expect(targetUser).toBeTruthy();

    // 1. Temporarily grant admin to target user
    const grantRes = await request.patch(`/api/superadmin?id=${targetUser.id}`, {
      data: { isAdmin: true },
    });
    expect(grantRes.status()).toBe(200);
    const grantData = await grantRes.json();
    expect(grantData.user.is_admin || grantData.user.isAdmin).toBe(true);

    // 2. Revoke admin back to standard user
    const revokeRes = await request.patch(`/api/superadmin?id=${targetUser.id}`, {
      data: { isAdmin: false },
    });
    expect(revokeRes.status()).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.user.is_admin || revokeData.user.isAdmin).toBe(false);
  });
});
