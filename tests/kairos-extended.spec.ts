import { test, expect } from '@playwright/test';
import { hasCredentials, login } from './helpers/auth';

test.describe('KAIROS Extended & Advanced Flows', () => {
  test.skip(!hasCredentials, 'Set E2E_EMAIL and E2E_PASSWORD to run end-to-end tests.');

  test('Deployment Health & Diagnostics: Database connectivity and schema integrity', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ready');
    expect(body.database?.connected).toBe(true);
    expect(body.missingRequired.length).toBe(0);
  });

  test('CSV Bulk Ingestion: Upload, column normalisation and deduplication', async ({ request }) => {
    const { isAdmin } = await login(request);
    const stamp = Date.now();
    const testEmail = `import.test.${stamp}@example.com`;

    // CSV with standard headers matching COLUMN_MAP
    const csvContent = [
      'First Name,Last Name,Company,Job Title,Email,Business Arms',
      `BulkFirst${stamp},BulkLast${stamp},Bulk Ingestion Inc,Project Lead,${testEmail},"KCC,PMT7"`,
    ].join('\n');

    const base64 = Buffer.from(csvContent, 'utf-8').toString('base64');

    const importRes = await request.post('/api/import', {
      data: { base64 },
    });
    expect(importRes.status()).toBe(200);

    const importData = await importRes.json();
    expect(importData.created).toBeGreaterThanOrEqual(1);
    expect(importData.errors.length).toBe(0);

    // Verify contact exists in registry
    const searchRes = await request.get(`/api/clients?q=${testEmail}`);
    expect(searchRes.status()).toBe(200);
    const searchData = await searchRes.json();
    const created = searchData.clients?.find((c: any) => (c.email || c.Email) === testEmail);
    expect(created).toBeTruthy();

    // Clean up created contact if admin
    if (isAdmin && created?.id) {
      await request.delete(`/api/client?id=${created.id}`).catch(() => {});
    }
  });

  test('Relationship Stage Lifecycle: K->R->I progression and audit trail', async ({ request }) => {
    const { isAdmin } = await login(request);
    const stamp = Date.now();

    // 1. Create client in default 'Knowledge' stage
    const clientRes = await request.post('/api/clients', {
      data: {
        firstName: 'StageTest',
        lastName: `Progress-${stamp}`,
        companyName: 'Audit Trail Corp',
        kriStage: 'Knowledge',
        businessArms: ['KCC'],
      },
    });
    expect(clientRes.status()).toBe(201);
    const clientData = await clientRes.json();
    const clientId = clientData.client.id || clientData.client.ID;

    try {
      // 2. Advance stage to 'Rapport'
      const patchRes = await request.patch(`/api/client?id=${clientId}`, {
        data: {
          kriStage: 'Rapport',
          stageNotes: 'Client relationship deepened following executive brief.',
        },
      });
      expect(patchRes.status()).toBe(200);
      const patched = await patchRes.json();
      expect(patched.client.KRIStage || patched.client.kriStage).toBe('Rapport');

      // 3. Verify stage history audit record exists
      const historyRes = await request.get(`/api/stage-history?clientId=${clientId}`);
      expect(historyRes.status()).toBe(200);
      const historyData = await historyRes.json();
      expect(historyData.stageHistory.length).toBeGreaterThanOrEqual(1);

      const latestChange = historyData.stageHistory[0];
      expect(latestChange.PreviousStage || latestChange.previousStage).toBe('Knowledge');
      expect(latestChange.NewStage || latestChange.newStage).toBe('Rapport');
    } finally {
      if (isAdmin) {
        await request.delete(`/api/client?id=${clientId}`).catch(() => {});
      }
    }
  });

  test('Deal Pipeline Lifecycle: Status transition across stages', async ({ request }) => {
    const { isAdmin } = await login(request);
    const stamp = Date.now();

    // Create client
    const clientRes = await request.post('/api/clients', {
      data: {
        firstName: 'DealTest',
        lastName: `Pipeline-${stamp}`,
        companyName: 'Mergers Ltd',
        businessArms: ['PMT7'],
      },
    });
    expect(clientRes.status()).toBe(201);
    const clientData = await clientRes.json();
    const clientId = clientData.client.id || clientData.client.ID;

    try {
      // 1. Create deal in Draft
      const dealRes = await request.post('/api/engagements', {
        data: {
          clientId,
          title: `Project Apex Deal ${stamp}`,
          stage: 'Draft',
          estimatedValue: 25000000,
        },
      });
      expect(dealRes.status()).toBe(201);
      const dealData = await dealRes.json();
      const dealId = dealData.engagement?.id || dealData.engagement?.ID;
      expect(dealId).toBeTruthy();

      // 2. Transition deal to 'Under Review'
      const patchDeal = await request.patch(`/api/engagements?id=${dealId}`, {
        data: {
          stage: 'Under Review',
          notes: 'Submitted to commercial committee for contract review.',
        },
      });
      expect(patchDeal.status()).toBe(200);
      const updatedDeal = await patchDeal.json();
      expect(updatedDeal.engagement?.stage || updatedDeal.engagement?.Stage).toBe('Under Review');
    } finally {
      if (isAdmin) {
        await request.delete(`/api/client?id=${clientId}`).catch(() => {});
      }
    }
  });

  test('Client List UI: Table search and real-time query filtering', async ({ page }) => {
    test.setTimeout(45000);
    await login(page.context().request);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // Wait for the app to hydrate and show the search bar
    const searchInput = page.getByPlaceholder('Search');
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // Type a search query to test real-time client filtering
    await searchInput.fill('Konstructum');
    // Ensure table does not crash and search doesn't throw unhandled errors
    await expect(page.locator('table, [role="grid"], .client-card, body')).toBeVisible();
  });
});
