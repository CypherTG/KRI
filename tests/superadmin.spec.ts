import { test, expect } from '@playwright/test';
import { login, hasCredentials } from './helpers/auth';

const SUPERADMIN_EMAIL = 'mbello@konstructum.com';
const SUPERADMIN_PASSWORD = process.env.E2E_PASSWORD || 'KairosAdmin2026!';

test.describe('Superadmin Console & Root Security Governance', () => {
  test.skip(!hasCredentials, 'Set E2E_EMAIL and E2E_PASSWORD to run superadmin tests.');

  test('Superadmin mbello@konstructum.com can authenticate and access system telemetry', async ({ request }) => {
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
    expect(data.users.length).toBeGreaterThanOrEqual(1);
    expect(data.counts.clients).toBeGreaterThan(0);
    expect(data.storage).toHaveProperty('blobConfigured');
  });

  test('Anonymous access to /api/superadmin is rejected', async ({ request }) => {
    const res = await request.get('/api/superadmin');
    expect([401, 403]).toContain(res.status());
  });

  test('Superadmin can promote and manage administrators via PATCH /api/superadmin', async ({ request }) => {
    // Log in as root superadmin mbello@konstructum.com
    await request.post('/api/auth/login', {
      data: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD },
    });

    // Create a temporary colleague user to test promotion/demotion
    const stamp = Date.now();
    const tempUserEmail = `colleague${stamp}@konstructum.com`;
    const createRes = await request.post('/api/users', {
      data: {
        email: tempUserEmail,
        displayName: `Colleague ${stamp}`,
        jobTitle: 'Associate',
        isAdmin: false,
      },
    });
    expect([200, 201]).toContain(createRes.status());
    const createData = await createRes.json();
    const tempUserId = createData.user?.ID || createData.user?.id;
    expect(tempUserId).toBeTruthy();

    try {
      // 1. Promote to Admin
      const grantRes = await request.patch(`/api/superadmin?id=${tempUserId}`, {
        data: { isAdmin: true },
      });
      expect(grantRes.status()).toBe(200);
      const grantData = await grantRes.json();
      expect(grantData.user.is_admin ?? grantData.user.isAdmin).toBe(true);

      // 2. Revoke admin back to standard user
      const revokeRes = await request.patch(`/api/superadmin?id=${tempUserId}`, {
        data: { isAdmin: false },
      });
      expect(revokeRes.status()).toBe(200);
      const revokeData = await revokeRes.json();
      expect(revokeData.user.is_admin ?? revokeData.user.isAdmin).toBe(false);
    } finally {
      // Deactivate temporary user
      await request.patch(`/api/superadmin?id=${tempUserId}`, {
        data: { isActive: false },
      }).catch(() => { });
    }
  });
});
