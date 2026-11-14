import { test, expect } from '@playwright/test';
import { hasCredentials, login } from './helpers/auth';

test.describe('signed-in checks (need E2E_EMAIL and E2E_PASSWORD)', () => {
  test.skip(!hasCredentials, 'Set E2E_EMAIL and E2E_PASSWORD to run these.');

  test('can sign in and reach the dashboard', async ({ page }) => {
    await login(page.context().request);
    await page.goto('/dashboard');
    await expect(page.getByText(/sign out/i).first()).toBeVisible();
  });

  test('saving a contact with business arms does not hit "malformed array literal"', async ({ request }) => {
    const { isAdmin } = await login(request);
    const stamp = Date.now();

    const created = await request.post('/api/clients', {
      data: {
        firstName: 'PlaywrightTest',
        lastName: `Delete-${stamp}`,
        companyName: 'Playwright Test Co',
        businessArms: ['NGneered Projects', 'KCC'],
      },
    });
    const text = await created.text();
    expect(text).not.toMatch(/malformed array literal/i);
    expect(created.status(), text.slice(0, 200)).toBe(201);

    // Same save with an empty array, which is what caused the "" error.
    const empty = await request.post('/api/clients', {
      data: { firstName: 'PlaywrightTest', lastName: `Delete-${stamp}-b`, businessArms: [] },
    });
    const emptyText = await empty.text();
    expect(emptyText).not.toMatch(/malformed array literal/i);
    expect(empty.status(), emptyText.slice(0, 200)).toBe(201);

    // Clean up. Only admins can delete, so non-admin runs leave two clearly
    // named rows ("PlaywrightTest Delete-...") to remove by hand.
    if (isAdmin) {
      for (const res of [created, empty]) {
        const id = (JSON.parse(await res.text()) as any).client?.id ?? (JSON.parse(await res.text()) as any).client?.ID;
        if (id) await request.delete(`/api/client?id=${id}`);
      }
    }
  });

  test('lookups return companies, projects and job titles', async ({ request }) => {
    await login(request);
    const res = await request.get('/api/lookups');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.companies)).toBe(true);
    expect(body.companies.length).toBeGreaterThan(0);
    expect(Array.isArray(body.jobTitles)).toBe(true);
  });
});
