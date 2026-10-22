const { test, expect } = require('@playwright/test');

test('House browsing and cookie sign-in work without a frontend provider lookup', async ({ page }) => {
  const configRequests = [];
  await page.route('**/api/frontend-config', route => {
    configRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto('/shop');
  await expect(page.getByRole('heading', { name: 'Find your next favorite.', exact: true })).toBeVisible();
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Your private shopping room.', exact: true })).toBeVisible();
  expect((await page.request.post('/api/session', {
    headers: { Authorization: 'Bearer e2e-designer-token', Origin: 'http://127.0.0.1:4173' }
  })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('link', { name: 'View my page', exact: true })).toBeVisible();
  expect(configRequests).toEqual([]);
});
