const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test(`buying details appear once before the cart action at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/gallery*', route => route.fulfill({ json: { items: [{
      id: 'clarity-piece', title: 'Clarity dress', price: 89, category: 'womenswear',
      status: 'published', productionType: 'One of a Kind', availableQuantity: 1,
      handlingDaysMin: 2, handlingDaysMax: 4,
      description: 'An independent original.\n[GARMENT DETAILS]\nGarment Measurements: Waist 30 inches\nFit Notes: Relaxed through the hips\nMaterial: Cotton\nCare Instructions: Hand wash cold\n[END GARMENT DETAILS]',
    }] } }));
    await page.goto('/shop/clarity-piece');
    const essentials = page.getByRole('region', { name: 'Purchase essentials', exact: true });
    await expect(essentials).toBeVisible();
    for (const text of ['Waist 30 inches', 'Relaxed through the hips', 'Free US delivery', '2–4 business days', 'Carrier transit time is additional.']) {
      await expect(essentials).toContainText(text);
    }
    await expect(page.getByText(/Waist 30 inches/)).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Fabric & care', exact: true })).toBeVisible();
    await expect(page.getByText('Hand wash cold', { exact: true })).toBeVisible();
    expect(await essentials.evaluate(el => {
      const buy = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Add to cart'));
      return Boolean(buy && el.compareDocumentPosition(buy) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    await expect(essentials.getByRole('link', { name: 'Shipping policy', exact: true })).toHaveAttribute('href', '/shipping.html');
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Added · View cart', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
