const { test, expect } = require('@playwright/test');

async function openDesignerSession(request) {
  const response = await request.post('/api/session', { headers: { Authorization: 'Bearer e2e-designer-token' } });
  expect(response.ok()).toBeTruthy();
}

test('designer session persists profile socials and public storefront hides private accounts', async ({ page, request }) => {
  await openDesignerSession(request);
  const profile = await request.patch('/api/my/designer-profile', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { brandName: 'E2E Atelier', socialLinks: {
      instagram: { url: 'https://instagram.com/e2eatelier', visible: true },
      tiktok: { url: 'https://tiktok.com/@e2eatelier', visible: false }
    }}
  });
  expect(profile.ok()).toBeTruthy();

  await page.goto('/designers/maker');
  await expect(page).toHaveURL(/\/designers\/maker$/);
  const publicProfile = await request.get('/api/designers/maker');
  const publicBody = await publicProfile.json();
  expect(publicBody.designer.socialLinks.instagram.url).toContain('instagram.com/e2eatelier');
  expect(publicBody.designer.socialLinks.tiktok).toBeUndefined();

  const mine = await request.get('/api/my/designer-profile');
  const mineBody = await mine.json();
  expect(mineBody.designer.socialLinks.tiktok.visible).toBe(false);
});

test('cookie-authenticated cross-site mutation is rejected and same-origin mutation succeeds', async ({ request }) => {
  await openDesignerSession(request);
  const blocked = await request.patch('/api/my/designer-profile', {
    headers: { Origin: 'https://evil.example' },
    data: { brandName: 'Blocked' }
  });
  expect(blocked.status()).toBe(403);

  const allowed = await request.patch('/api/my/designer-profile', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { brandName: 'Allowed Atelier' }
  });
  expect(allowed.ok()).toBeTruthy();
});

test('storefront route records an anonymous designer view without storing an IP field', async ({ page, request }) => {
  await page.goto('/designers/maker');
  await page.waitForLoadState('networkidle');
  const analytics = await request.get('/api/admin/analytics', { headers: { Authorization: 'Bearer e2e-admin-token' } });
  expect(analytics.ok()).toBeTruthy();
  const body = await analytics.json();
  expect(body.traffic.topDesigners.some((row) => row.designerId === 'maker' && row.views >= 1)).toBeTruthy();
});


test('buyer can review a seeded piece in the suitcase and remove it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('house-of-briar:cart', JSON.stringify(['e2e-piece'])));
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Pieces waiting for you.' })).toBeVisible();
  await expect(page.getByText('Moonlit E2E Piece')).toBeVisible();
  await expect(page.getByText('$89.99')).toBeVisible();
  await expect(page.getByRole('link', { name: /Continue to checkout/ })).toBeEnabled();

  await page.getByRole('button', { name: 'Remove Moonlit E2E Piece from bag' }).click();
  await expect(page.getByText('Your suitcase is open and waiting.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('house-of-briar:cart'))).toBe('[]');
});

test('buyer checkout uses server totals and hands the order to the mocked Stripe boundary', async ({ page }) => {
  let checkoutPayload;
  await page.route('**/api/checkout/session', async route => {
    checkoutPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'http://127.0.0.1:4173/checkout?provider=mock-stripe' })
    });
  });
  await page.addInitScript(() => localStorage.setItem('house-of-briar:cart', JSON.stringify(['e2e-piece'])));

  await page.goto('/cart');
  await expect(page.getByText('Moonlit E2E Piece')).toBeVisible();
  await expect(page.getByRole('link', { name: /Continue to checkout/ })).toBeEnabled();
  await page.getByRole('link', { name: /Continue to checkout/ }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'A thoughtful final step.' })).toBeVisible();
  await expect(page.getByText('Moonlit E2E Piece')).toBeVisible();
  await expect(page.getByText('$89.99').first()).toBeVisible();
  const secureCheckout = page.getByRole('button', { name: /Continue to secure checkout/ });
  await expect(secureCheckout).toBeEnabled();
  await secureCheckout.click();

  await expect.poll(() => checkoutPayload).toEqual({
    items: [{ id: 'e2e-piece', quantity: 1 }],
    promoCodes: [],
    expectedTotalBeforeTaxCents: 8999
  });
  await expect(page).toHaveURL(/provider=mock-stripe/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('house-of-briar:checkout-pending') || 'null'))).toMatchObject({
    ids: ['e2e-piece'],
    subtotal: 89.99
  });
});
