import { test, expect } from '@playwright/test';

test.describe('sign-in screen (no account needed)', () => {
  test('shows both tabs and the sign-in fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Create account' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
  });

  test('submit stays disabled until email and password are filled', async ({ page }) => {
    await page.goto('/');
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeDisabled();
    await page.getByRole('textbox', { name: 'Email' }).fill('playwright-nobody@konstructum.com');
    await expect(submit).toBeDisabled();
    await page.getByRole('textbox', { name: 'Password' }).fill('not-a-real-password');
    await expect(submit).toBeEnabled();
  });

  test('create-account tab asks for name and job title', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Create account' }).click();
    await expect(page.getByLabel('Full name')).toBeVisible();
    await expect(page.getByLabel('Job title')).toBeVisible();
  });

  test('a wrong password is rejected by the API', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: 'playwright-nobody@konstructum.com', password: 'definitely-wrong' },
    });
    expect([400, 401, 403]).toContain(res.status());
  });
});
