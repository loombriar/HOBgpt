const { test, expect } = require('@playwright/test');
const path = require('node:path');
const pieces = [
  { id: 'masculine-shirt', title: 'Masculine shirt fixture', price: 40, category: 'apparel', style: 'Top', presentation: 'menswear', productionType: 'Made in Multiple', designerId: 'maker', designerName: 'Test maker', images: [] },
  { id: 'womenswear-dress', title: 'Womenswear dress fixture', price: 60, category: 'apparel', style: 'Dress', presentation: 'womenswear', designerId: 'maker', designerName: 'Test maker', images: [] },
];
async function reactHome(page) {
  await page.route('http://127.0.0.1:4173/', route => route.fulfill({ path: path.join(__dirname, '../apps/default/dist/index.html'), contentType: 'text/html' }));
}
test('collection failure offers a retry that restores real catalog products', async ({ page }) => {
  await reactHome(page);
  let failed = true;
  await page.route('**/api/gallery', route => failed ? route.fulfill({ status: 503, json: { error: 'Unavailable fixture' } }) : route.fulfill({ json: { items: pieces } }));
  await page.goto('/');
  await expect(page.getByRole('alert').filter({ hasText: 'The collection could not load.' })).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: 'Retry collection', exact: true }).click();
  await expect(page.getByRole('heading', { name: pieces[0].title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry collection', exact: true })).toHaveCount(0);
});
test('homepage menswear link filters apparel by presentation', async ({ page }) => {
  await reactHome(page);
  await page.route('**/api/gallery', route => route.fulfill({ json: { items: pieces } }));
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Explore fashion' }).getByRole('link', { name: 'Menswear', exact: true }).click();
  await expect(page.locator('#category-filter')).toHaveValue('apparel');
  await expect(page.getByRole('heading', { name: pieces[0].title, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: pieces[1].title, exact: true })).toHaveCount(0);
});
test('checkout labels multiple-stock products without claiming one of one', async ({ page }) => {
  await page.route('**/api/gallery', route => route.fulfill({ json: { items: pieces } }));
  await page.route('**/api/checkout/quote', route => route.fulfill({ json: { shippingReady: true, shippingCents: 0, merchandiseCents: 4000, discountCents: 0, totalBeforeTaxCents: 4000, designers: [], items: [] } }));
  await page.addInitScript(() => localStorage.setItem('house-of-briar:cart', JSON.stringify(['masculine-shirt'])));
  await page.goto('/checkout');
  await expect(page.getByText('Made in Multiple · Qty 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to secure checkout', exact: true })).toBeEnabled();
  await expect(page.getByText('One of one · Qty 1', { exact: true })).toHaveCount(0);
});
test('download checkout does not promise a physical shipment or preparation time', async ({ page }) => {
  const download = { ...pieces[0], id: 'pdf-pattern', title: 'PDF pattern fixture', category: 'patterns', patternFormat: 'pdf' };
  await page.route('**/api/gallery', route => route.fulfill({ json: { items: [download] } }));
  await page.route('**/api/checkout/quote', route => route.fulfill({ json: { shippingReady: true, shippingCents: 0, merchandiseCents: 4000, discountCents: 0, totalBeforeTaxCents: 4000, designers: [{ designerId: 'maker', designerName: 'Test maker', shippingCents: 0, shippingReady: true }], items: [{ id: download.id, title: download.title, handlingDaysMin: null, handlingDaysMax: null }] } }));
  await page.addInitScript(() => localStorage.setItem('house-of-briar:cart', JSON.stringify(['pdf-pattern'])));
  await page.goto('/checkout');
  await expect(page.getByText('PDF download · Qty 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Digital delivery', exact: true })).toBeVisible();
  await expect(page.getByText(/PDF pattern fixture: Preparation time/)).toHaveCount(0);
  await expect(page.getByText('Test maker: Free US delivery', { exact: true })).toHaveCount(0);
});
