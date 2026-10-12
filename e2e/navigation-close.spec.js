const { test, expect } = require('@playwright/test');
for (const width of [390, 1280]) {
  test(`compact navigation opens shopping, account and cart at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const nav = page.locator('#hob-global-nav');
    await expect(page.locator('.site-header.sewing-header')).not.toBeVisible();
    await nav.getByRole('link', { name: 'Shop', exact: true }).click();
    await expect(page).toHaveURL(/#shop$/);
    await expect(nav).toBeInViewport();
    await nav.locator('#header-customer-auth-btn').click();
    await expect(page.locator('#visitor-suite-modal')).toBeVisible();
    await page.locator('#visitor-suite-close').click();
    await nav.locator('#cart-btn').click();
    await expect(page.locator('#cart-dialog')).toBeVisible();
  });
}
