const { test, expect } = require('@playwright/test');
const item = { id: 'storage-piece', title: 'Storage test piece', price: 40, category: 'apparel', designerId: 'maker', images: [] };
async function catalog(page) {
  await page.route('**/api/gallery', route => route.fulfill({ json: { items: [item] } }));
  await page.route('**/api/checkout/quote', route => route.fulfill({ json: { shippingReady: true, shippingCents: 0, merchandiseCents: 4000, discountCents: 0, totalBeforeTaxCents: 4000, designers: [], items: [] } }));
}
async function denyStorage(page, operation, key) {
  await page.evaluate(({ operation, key }) => {
    const original = Storage.prototype[operation];
    Storage.prototype[operation] = function (...args) {
      if (this === localStorage && args[0] === key) throw new DOMException('Storage denied fixture', 'QuotaExceededError');
      return original.apply(this, args);
    };
  }, { operation, key });
}

test('denied snapshot write stops checkout before requesting a provider session and can recover', async ({ page }) => {
  await catalog(page);
  await page.addInitScript(() => localStorage.setItem('house-of-briar:cart', JSON.stringify(['storage-piece'])));
  let sessions = 0;
  await page.route('**/api/checkout/session', route => { sessions++; return route.fulfill({ status: 503, json: { error: { message: 'Provider unavailable fixture' } } }); });
  await page.goto('/checkout');
  const button = page.getByRole('button', { name: 'Continue to secure checkout', exact: true });
  await expect(button).toBeEnabled();
  await denyStorage(page, 'setItem', 'house-of-briar:checkout-pending');
  await button.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your browser could not save checkout details.' })).toBeVisible();
  await expect(button).toBeEnabled();
  expect(sessions).toBe(0);
  // A fresh page with writable storage can retry; a provider failure still has its own message.
  await page.reload();
  await expect(button).toBeEnabled();
  await denyStorage(page, 'removeItem', 'house-of-briar:checkout-pending');
  await button.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Provider unavailable fixture' })).toBeVisible();
  expect(sessions).toBe(1);
});

for (const [operation, key] of [['setItem', 'house-of-briar:cart'], ['removeItem', 'house-of-briar:checkout-pending']]) {
  test(`verified payment remains confirmed when ${operation} fails during cleanup`, async ({ page }) => {
    await catalog(page);
    await page.addInitScript(() => {
      localStorage.setItem('house-of-briar:cart', JSON.stringify(['storage-piece', 'another-piece']));
      localStorage.setItem('house-of-briar:checkout-pending', JSON.stringify({ ids: ['storage-piece'], items: [{ id: 'storage-piece', name: 'Storage test piece', amount: 40, quantity: 1 }], subtotal: 40 }));
    });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/checkout/session/cs_storage_fixture', async route => {
      await gate;
      return route.fulfill({ json: { paid: true, orderId: 'storage-order', status: 'paid' } });
    });
    await page.goto('/checkout?checkout=success&session_id=cs_storage_fixture');
    await expect(page.getByText('Verifying your payment with Stripe. Please keep this page open.', { exact: true })).toBeVisible();
    await denyStorage(page, operation, key);
    release();
    await expect(page.getByRole('heading', { name: 'Order confirmed', exact: true })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Do not pay for these pieces again.' })).toBeVisible();
    await expect(page.getByText('Payment confirmation is not available yet.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continue to secure checkout', exact: true })).toHaveCount(0);
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('house-of-briar:cart')));
    expect(cart).toContain('another-piece');
    if (operation === 'removeItem') expect(cart).not.toContain('storage-piece');
  });
}
