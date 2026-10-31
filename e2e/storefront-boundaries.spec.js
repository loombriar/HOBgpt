const { test, expect } = require('@playwright/test');

test('cart survives navigation between the original storefront and React, including removal', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'View Moonlit E2E Piece details', exact: true }).click();
  await page.locator('#product-dialog').getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('house-of-briar:cart') || '[]'))).toContain('e2e-piece');
  await page.goto('/cart');
  await expect(page.getByRole('main').getByText('Moonlit E2E Piece', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Remove Moonlit E2E Piece from bag' }).click();
  await page.goto('/');
  await page.getByRole('button', { name: 'View Moonlit E2E Piece details', exact: true }).click();
  await expect(page.locator('#product-dialog').getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
});

test('designer cookie session survives React navigation and sign-out removes server access', async ({ page, request }) => {
  expect((await request.post('/api/session', { headers: { Authorization: 'Bearer e2e-designer-token' } })).ok()).toBeTruthy();
  for (const route of ['/designers/room', '/shop', '/account', '/']) {
    await page.goto(route);
    expect((await request.get('/api/my/designer-profile')).ok()).toBeTruthy();
  }
  expect((await request.delete('/api/session', { headers: { Origin: 'http://127.0.0.1:4173' } })).ok()).toBeTruthy();
  expect((await request.get('/api/my/designer-profile')).status()).toBe(401);
});
