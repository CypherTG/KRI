import { expect, type APIRequestContext } from '@playwright/test';

export const hasCredentials = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

/**
 * Signs in through the real login endpoint. The session cookie is stored on the
 * request context, and `page.context().request` shares cookies with the page, so
 * both API and UI tests can use it.
 */
export async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', {
    data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
  });
  const body = await res.text();
  expect(res.status(), `login failed: ${body.slice(0, 200)}`).toBe(200);
  return JSON.parse(body) as { isAdmin: boolean; user: { id: string } };
}
