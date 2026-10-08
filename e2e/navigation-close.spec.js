const { test, expect } = require('@playwright/test');
for (const width of [390, 1280]) {
  test(`navigation closes after a link or account action at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const shop = page.locator('.sewing-nav details').filter({ has: page.locator('summary').filter({ hasText: /^Shop/ }) });
    await shop.locator('summary').click();
    await expect(shop).toHaveAttribute('open', '');
    await shop.getByRole('link', { name: 'Shop All', exact: true }).click();
    await expect(shop).not.toHaveAttribute('open');
    const customers = page.locator('.sewing-nav details').filter({ has: page.locator('summary').filter({ hasText: /^Customers/ }) });
    await customers.locator('summary').click();
    await customers.getByRole('button', { name: 'Open customer account', exact: true }).click();
    await expect(customers).not.toHaveAttribute('open');
    await expect(page.locator('#visitor-suite-modal')).toBeVisible();
  });
}
