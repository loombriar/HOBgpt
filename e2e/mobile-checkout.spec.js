const { test, expect, devices } = require('@playwright/test');

test.use({ ...devices['iPhone 13'] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('house-of-briar:cart');
    localStorage.removeItem('house-of-briar:checkout-pending');
  });
});

test('mobile checkout has readable heading and an accessible route back to the bag', async ({ page }) => {
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'A thoughtful final step.' })).toBeVisible();
  const back = page.getByRole('link', { name: /back to suitcase/i });
  await expect(back).toBeVisible();
  await back.focus();
  await expect(back).toBeFocused();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('cancelled checkout preserves a clear recovery route on mobile', async ({ page }) => {
  await page.goto('/checkout?checkout=canceled');
  await expect(page.getByRole('heading', { name: 'A thoughtful final step.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /back to suitcase/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /explore the collection/i })).toBeVisible();
});

test('mobile bag remains accessible with an empty cart', async ({ page }) => {
  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: 'Pieces waiting for you.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /continue shopping/i })).toBeVisible();
});
