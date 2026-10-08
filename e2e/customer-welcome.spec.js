const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test(`first-time shopper can enter their account from the welcome guide at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    expect(await page.locator('#shop').evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('.house-editorial')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await page.locator('[data-customer-welcome]').click();
    await expect(page.locator('#visitor-suite-modal')).toBeVisible();
    await expect(page.locator('#customer-signup-email')).toBeFocused();
    await expect(page.getByText('No password to create or remember.', { exact: true })).toBeVisible();
    const email = `welcome-${width}@example.com`;
    await page.locator('#customer-signup-email').fill(email);
    await page.locator('#customer-rules-consent').check();
    await page.getByRole('button', { name: 'Email me a sign-in code', exact: true }).click();
    await expect(page.getByLabel('Six-digit email code', { exact: true })).toBeVisible();
    const response = await page.request.get(`/__test/customer-code?email=${encodeURIComponent(email)}`);
    expect(response.ok()).toBeTruthy();
    await page.getByLabel('Six-digit email code', { exact: true }).fill((await response.json()).code);
    await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
    await expect(page.locator('#customer-signed-in')).toBeVisible();
    await page.getByRole('button', { name: 'Save my measurements', exact: true }).click();
    await expect(page.locator('#measurement-profile-name')).toBeFocused();
    await page.locator('#visitor-suite-modal').evaluate(el => el.scrollTop = el.scrollHeight);
    await expect(page.locator('#visitor-suite-close')).toBeInViewport();
    await page.locator('#visitor-suite-close').click();
    await expect(page.locator('#visitor-suite-modal')).not.toBeVisible();
    await page.locator('#header-customer-auth-btn').click();
    await page.getByRole('button', { name: 'Shop the pieces →', exact: true }).click();
    await expect(page.locator('#visitor-suite-modal')).not.toBeVisible();
    await expect(page.locator('#shop')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
