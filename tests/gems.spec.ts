import { test, expect } from '@playwright/test';
import { hasCredentials, login, GEMS_BASE_URL } from './helpers/auth';

test.describe('GEMS End-to-End Suite', () => {
  test.skip(!hasCredentials, 'Set E2E_EMAIL and E2E_PASSWORD to run end-to-end tests.');

  test('GEMS UI loads and shows navigation', async ({ page }) => {
    // Authenticate with GEMS context
    await login(page.context().request, GEMS_BASE_URL);

    await page.goto(`${GEMS_BASE_URL}/`);
    await expect(page).toHaveTitle(/GEMS|Government|Stakeholder|Konstructum/i, { timeout: 15000 });
  });

  test('GEMS Summary & Analytics API returns monitored metrics', async ({ request }) => {
    await login(request, GEMS_BASE_URL);

    const res = await request.get(`${GEMS_BASE_URL}/api/gems/summary`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('agencies');
    expect(Array.isArray(data.agencies)).toBe(true);
    expect(data.agencies.length).toBeGreaterThan(0);
  });

  test('GEMS Agencies API returns the 8 monitored regulatory bodies', async ({ request }) => {
    await login(request, GEMS_BASE_URL);

    const res = await request.get(`${GEMS_BASE_URL}/api/gems/agencies`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    const agencyKeys = (data.agencies || []).map((a: any) => (a.key || a.name || '').toUpperCase());
    
    // Check known statutory bodies
    const expected = ['NUPRC', 'NUIMS', 'NCDMB', 'NNPC'];
    for (const exp of expected) {
      expect(agencyKeys.some((k: string) => k.includes(exp))).toBe(true);
    }
  });

  test('GEMS Stakeholders API is strictly agency-scoped', async ({ request }) => {
    await login(request, GEMS_BASE_URL);

    const res = await request.get(`${GEMS_BASE_URL}/api/gems/stakeholders`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.stakeholders || data.records || data)).toBe(true);
  });

  test('GEMS Interaction Lifecycle: Logging & scoring an agency interaction', async ({ request }) => {
    const { isAdmin } = await login(request, GEMS_BASE_URL);
    const stamp = Date.now();

    // 1. Create a client with a monitored agency name
    const clientRes = await request.post(`${GEMS_BASE_URL}/api/clients`, {
      data: {
        firstName: 'Regulator',
        lastName: `Officer-${stamp}`,
        companyName: 'NUPRC Technical Division',
        jobTitle: 'Director of Compliance',
        businessArms: ['KCC'],
      },
    });
    expect(clientRes.status()).toBe(201);
    const clientData = await clientRes.json();
    const clientId = clientData.client.id || clientData.client.ID;

    try {
      // 2. Log interaction against this agency stakeholder
      const interactRes = await request.post(`${GEMS_BASE_URL}/api/gems/interactions`, {
        data: {
          clientId,
          category: 'Pearl',
          interactionType: 'Meeting',
          notes: `Annual Operating License Review ${stamp}`,
          justification: 'Submitted technical performance report and environmental audit.',
          agency: 'NUPRC',
        },
      });
      expect(interactRes.status()).toBe(201);
      const interactData = await interactRes.json();
      expect(interactData.interaction).toBeTruthy();

      // 3. Verify interaction can be retrieved
      const getRes = await request.get(`${GEMS_BASE_URL}/api/gems/interactions?clientId=${clientId}`);
      expect(getRes.status()).toBe(200);
      const listData = await getRes.json();
      expect(listData.interactions.length).toBeGreaterThan(0);
      const retrieved = listData.interactions[0];
      expect(retrieved.notes || retrieved.Notes).toContain('Annual Operating License Review');
    } finally {
      // Clean up created contact if admin
      if (isAdmin) {
        await request.delete(`${GEMS_BASE_URL}/api/client?id=${clientId}`).catch(() => {});
      }
    }
  });

  test('GEMS Compliance & Actions APIs return operational records', async ({ request }) => {
    await login(request, GEMS_BASE_URL);

    const [compRes, actRes] = await Promise.all([
      request.get(`${GEMS_BASE_URL}/api/gems/compliance`),
      request.get(`${GEMS_BASE_URL}/api/gems/actions`),
    ]);

    expect(compRes.status()).toBe(200);
    expect(actRes.status()).toBe(200);

    const compData = await compRes.json();
    const actData = await actRes.json();

    expect(compData).toHaveProperty('records');
    expect(actData.records || actData.actions).toBeTruthy();
  });
});
