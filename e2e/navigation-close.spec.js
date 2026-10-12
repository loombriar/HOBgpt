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
    await page.locator('#cart-dialog-close').click();
    await nav.locator('#hob-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-hob-theme', 'dark');
    await page.goto('/creative-house.html#your-profile');
    await expect(page.locator('html')).toHaveAttribute('data-hob-theme', 'dark');
    await expect(page.locator('#profile-form')).toBeVisible();
    await expect(page.locator('#creative-access-status')).not.toHaveText('Checking your House account…');
    await page.locator('#hob-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-hob-theme', 'light');
    await page.locator('[data-creative-workflow="event"]').click();
    await expect(page.locator('#event-form')).toBeVisible();
    await expect(page.locator('#profile-form')).not.toBeVisible();
  });
}
