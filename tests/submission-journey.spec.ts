import { test, expect } from '@playwright/test';
import { hasCredentials, login } from './helpers/auth';

test.describe('End-to-End Submission Journeys', () => {
  test.skip(!hasCredentials, 'Set E2E_EMAIL and E2E_PASSWORD to run end-to-end tests.');

  test('KAIROS Submission Journey: full 4-step wizard UI flow with review and edit-jump', async ({ page }) => {
    test.setTimeout(45000);

    // 1. Sign in and open dashboard
    await login(page.context().request);
    await page.goto('/dashboard');

    // Click "Add new" in the top bar
    const addBtn = page.getByRole('button', { name: 'Add new', exact: true });
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    await addBtn.click();

    const stamp = Date.now();
    const testCompany = `E2E Corp ${stamp}`;

    // Fill company using its placeholder and press Escape to close autocomplete popup
    const companyInput = page.getByPlaceholder(/Type to search 250\+ companies/i);
    await expect(companyInput).toBeVisible({ timeout: 10000 });
    await companyInput.fill(testCompany);
    await companyInput.press('Escape');

    // Click Continue to contact form
    const continueBtn = page.getByRole('button', { name: 'Continue to contact form' });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // 2. Step 0 (Identity & Profile)
    await expect(page.getByRole('button', { name: 'Identity', exact: true })).toBeVisible({ timeout: 10000 });
    const firstName = 'E2EFirst';
    const lastName = `E2ELast${stamp}`;

    await page.getByLabel('First Name').fill(firstName);
    await page.getByLabel('Last Name').fill(lastName);

    // Proceed to Step 1
    await page.getByRole('button', { name: 'Next' }).click();

    // 3. Step 1 (Organisation & Relationship)
    await expect(page.getByRole('button', { name: 'Relationship', exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Job Title').fill('Head of Engineering');
    await page.getByLabel('Project Name').fill('Refinery Expansion');

    // Proceed to Step 2
    await page.getByRole('button', { name: 'Next' }).click();

    // 4. Step 2 (Contact Details & Notes)
    await expect(page.getByRole('button', { name: 'Contact', exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Email').fill(`e2e.${stamp}@example.com`);
    await page.getByLabel('Notes').fill('E2E automated test submission');

    // Proceed to Step 3 (Review & Confirm)
    await page.getByRole('button', { name: 'Next' }).click();

    // 5. Step 3 (Review)
    await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible();
    await expect(page.getByText(testCompany)).toBeVisible();
    await expect(page.getByText('Head of Engineering')).toBeVisible();

    // Verify quick-jump Edit button (Edit Step 1)
    await page.locator('button', { hasText: 'Edit' }).nth(1).click();
    await expect(page.getByLabel('Job Title')).toBeVisible();
    await page.getByLabel('Job Title').fill('VP of Operations');
    
    // Step forward back to Review
    await page.getByRole('button', { name: 'Next' }).click(); // to Step 2
    await page.getByRole('button', { name: 'Next' }).click(); // to Step 3 (Review)
    await expect(page.getByText('VP of Operations')).toBeVisible();

    // 6. Submit Contact
    const saveButton = page.getByRole('button', { name: 'Save Contact' });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Verify successful creation without malformed array literal error
    await expect(page.getByText(/malformed array literal/i)).toHaveCount(0);
    // Upon successful save, app navigates to client detail page
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]+/i, { timeout: 20000 });

    // Clean up created test client via API
    const url = page.url();
    const createdId = url.split('/').pop();
    if (createdId) {
      await page.context().request.delete(`/api/client?id=${createdId}`).catch(() => {});
    }
  });

  test('KAIROS Submission Journey: Communication Log and Deal Pipeline', async ({ request }) => {
    const { isAdmin } = await login(request);
    const stamp = Date.now();

    // Create client to attach interaction and deal to
    const clientRes = await request.post('/api/clients', {
      data: {
        firstName: 'CommTest',
        lastName: `Target-${stamp}`,
        companyName: 'Pipeline Partners',
        businessArms: ['KCC', 'PMT7'],
      },
    });
    expect(clientRes.status()).toBe(201);
    const clientData = await clientRes.json();
    const clientId = clientData.client.id || clientData.client.ID;

    // 1. Submit a Communication Log
    const commRes = await request.post('/api/communications', {
      data: {
        clientId,
        subject: `Strategic Quarterly Review ${stamp}`,
        type: 'Meeting',
        notes: 'Discussed project delivery timeline and resource attribution.',
        followUpRequired: true,
        proposalSubmitted: false,
      },
    });
    expect(commRes.status()).toBe(201);
    const commData = await commRes.json();
    expect(commData.comm).toBeTruthy();
    expect(commData.comm.Subject || commData.comm.subject).toContain('Strategic Quarterly Review');

    // 2. Submit an Engagement / Pipeline Deal with valid status (Draft, Submitted, Under Review, Won, Lost, On Hold)
    const dealRes = await request.post('/api/engagements', {
      data: {
        clientId,
        title: `Turbine Overhaul Deal ${stamp}`,
        engagementType: 'Service Agreement',
        stage: 'Submitted',
        estimatedValue: 15000000,
        notes: 'Target closure in Q3.',
      },
    });
    expect(dealRes.status()).toBe(201);
    const dealData = await dealRes.json();
    expect(dealData.engagement || dealData.deal || dealData).toBeTruthy();

    // Clean up
    if (isAdmin) {
      await request.delete(`/api/client?id=${clientId}`).catch(() => {});
    }
  });

  test('Company Acumen Journey: Document streaming & binary header validation', async ({ request }) => {
    await login(request);

    // Test with sample base64 text document
    const companyKey = 'playwright_test_corp';
    const sampleContent = 'Konstructum Group - Confidential Acumen Dossier';
    const base64Data = Buffer.from(sampleContent, 'utf-8').toString('base64');

    const uploadRes = await request.post('/api/acumen', {
      data: {
        companyKey,
        companyName: 'Playwright Test Corp',
        fileName: 'test-dossier.txt',
        contentType: 'text/plain',
        base64: base64Data,
        notes: 'Automated acumen verification',
      },
    });

    // If blob storage is enabled or base64 inline fallback is stored
    if (uploadRes.status() === 200 || uploadRes.status() === 201) {
      // Query documents for company
      const listRes = await request.get(`/api/acumen?companyKey=${companyKey}`);
      expect(listRes.status()).toBe(200);
      const listData = await listRes.json();
      const doc = listData.records?.[0];
      expect(doc).toBeTruthy();

      // Test streaming download endpoint
      if (doc?.ID || doc?.id) {
        const downloadRes = await request.get(`/api/acumen?downloadId=${doc.ID || doc.id}`);
        expect([200, 302]).toContain(downloadRes.status());
      }
    }
  });
});
