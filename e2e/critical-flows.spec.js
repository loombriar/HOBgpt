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
  await expect(page.getByRole('main').getByText('Moonlit E2E Piece', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('main').getByText('$89.99', { exact: true }).first()).toBeVisible();
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
  await expect(page.getByRole('main').getByText('Moonlit E2E Piece', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Continue to checkout/ })).toBeEnabled();
  await page.getByRole('link', { name: /Continue to checkout/ }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'A thoughtful final step.' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Moonlit E2E Piece', { exact: true }).first()).toBeVisible();
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


test('runway studio uploads a garment, walks, pauses and exports a preview', async ({ page }) => {
  await page.goto('/runway');
  await expect(page.getByRole('heading', { name: 'The Briar Runway' })).toBeVisible();
  await page.locator('#photo').setInputFiles({
    name: 'garment.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAwCAYAAABwrHhvAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAWElEQVRYhe3YwQ3AAAhC0e6/D2EuJrBbtJd38G4iKvxnzf1ZjwZmBCXCWMNziOYU1zOKd3wMyViyMqVhy08wmWhW4TTi+QEUg2gKUgWmO6ByUG3B6nymgxepbyktbUarWQAAAABJRU5ErkJggg==', 'base64')
  });
  await expect(page.getByRole('status')).toContainText('Photo ready');
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Walk', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('briar-runway.png');
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Photo removed');
  await expect(page.getByRole('link', { name: /House of Briar/ })).toHaveAttribute('href', '/designers/room');
});


test('admin panel entry displays daily traffic without a public website views shortcut', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Website views', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Admin panel', exact: true }).click();
  await expect(page.locator('#support .founding-designer-card img')).toHaveAttribute('src', '/founding-designer-berry-v1.webp');
  await expect(page.locator('#admin-review-workspace')).toBeHidden();
  await page.getByLabel('Administrator code').fill('e2e-admin-token');
  await page.locator('#admin-login-form button[type="submit"]').click();
  const traffic = page.locator('#admin-website-views');
  await expect(traffic.getByRole('heading', { name: 'Website views', exact: true })).toBeVisible();
  await expect(traffic.getByText('Page views', { exact: true })).toBeVisible();
  await expect(traffic.locator('.admin-traffic-stat').getByText('Visits', { exact: true })).toBeVisible();
  await expect(traffic.getByText("Today's page views", { exact: true })).toBeVisible();
  await expect(traffic.getByRole('heading', { name: 'Daily counts', exact: true })).toBeVisible();
  await expect(traffic.locator('#admin-daily-traffic tbody tr')).toHaveCount(30);
  await expect(traffic.locator('.admin-traffic-stat strong').first()).toHaveText(/[1-9][0-9,]*/);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(traffic).toHaveCount(0);
});

test('founding designer badge appears on listings and public designer storefront', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#product-grid .founding-badge').first()).toBeVisible();
  await expect(page.locator('#product-grid .founding-badge img').first()).toHaveAttribute('src', '/founding-designer-berry-v1.webp');
  await page.goto('/designers/maker');
  await expect(page.getByText('Founding Designer', { exact: true })).toBeVisible();
});


test('founding designer announcement advertises the badge and opens signup', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('complementary', { name: 'Founding designers' });
  await expect(banner).toContainText('The first 25 designers to join');
  await expect(banner.locator('#founder-spots')).toContainText('founding spots remain');
  await banner.getByRole('link', { name: 'Move in' }).click();
  await expect(page).toHaveURL(/designers\/room#designer-signup/);
  await expect(page.locator('#designer-signup-form')).toBeVisible();
});

for (const viewport of [{width:1280,height:800},{width:390,height:844}]) {
  test(`home navigation stays visible while scrolling at ${viewport.width}px`, async ({page}) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const header=page.locator('.site-header.sewing-header');
    await page.evaluate(()=>window.scrollTo({top:1200,behavior:'instant'}));
    await expect.poll(async()=>Math.round((await header.boundingBox()).y)).toBe(0);
    await expect(page.locator('#cart-btn')).toBeInViewport();
    await page.locator('.sewing-nav').getByRole('link',{name:'Support & Badges',exact:true}).click();
    await expect.poll(async()=>{
      const h=await header.boundingBox(),section=await page.locator('#support').boundingBox();
      return section.y >= h.y+h.height-2;
    }).toBe(true);
    for(const name of ['heart-of-the-house-berry-v1.webp','verified-buyer-berry-v1.webp','founding-designer-berry-v1.webp']){
      const artwork=page.locator(`#support img[src="/${name}"]`);
      await expect(artwork).toBeVisible();
      await expect.poll(()=>artwork.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    }
  });
}
