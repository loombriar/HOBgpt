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
    const categories = page.locator('#hob-global-nav .hob-creative-menu');
    await categories.locator('summary').click();
    await expect(categories).toHaveAttribute('open');
    await categories.getByRole('link', { name: 'Post an event', exact: true }).click();
    await expect(categories).not.toHaveAttribute('open');
    await expect(page.locator('#event-form')).toBeVisible();
    await expect(page.locator('#profile-form')).not.toBeVisible();
    await categories.locator('summary').click();
    await categories.locator('summary').press('Escape');
    await expect(categories).not.toHaveAttribute('open');
    await expect(categories.locator('summary')).toBeFocused();
    await categories.locator('summary').click();
    await page.locator('#hob-global-nav').getByRole('link', { name: 'The Creative House', exact: true }).click();
    await expect(page.locator('#hob-global-nav .hob-creative-menu')).not.toHaveAttribute('open');
    await page.locator('[data-creative-workflow="event"]').click();
    await expect(page.locator('#event-form')).toBeVisible();
    await expect(page.locator('#profile-form')).not.toBeVisible();
  });
}

for (const width of [390,1280]) {
  test(`rooms keep the storefront position and designer content precedes the footer at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    const nav=page.locator('#hob-global-nav');
    await nav.getByRole('link',{name:'Shop',exact:true}).click();
    await expect(page).toHaveURL(/#shop$/);
    await page.waitForTimeout(800);
    const before=await page.evaluate(()=>window.scrollY);
    await nav.locator('#header-customer-auth-btn').click();
    await expect(page.locator('#visitor-suite-modal')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(before);
    await page.locator('#visitor-suite-close').click();
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(before);
    await page.goto('/designers/room');
    await expect(page.locator('#designer-modal')).toBeVisible();
    expect(await page.evaluate(()=>Boolean(document.querySelector('#designer-modal').compareDocumentPosition(document.querySelector('.site-footer')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await page.goto('/shop');
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await page.getByRole('link',{name:/Cart/}).first().click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  });
}
