import { test, expect } from '@playwright/test';

test('KAIROS loads and shows the sign-in screen', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/KAIROS/);
  await expect(page.locator('#root')).not.toBeEmpty();
});

test('API rejects anonymous access', async ({ request }) => {
  const res = await request.get('/api/clients');
  expect(res.status()).toBe(401);
});
