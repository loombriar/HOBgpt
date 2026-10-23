const { test, expect } = require('@playwright/test');

for (const width of [360, 390, 768, 1280]) {
  test(`homepage photos form equal rows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.route('**/api/gallery*', route => route.fulfill({ json: { items: Array.from({ length: 4 }, (_, i) => ({
      id: `layout-${i}`, title: `Independent piece ${i}`, designerId: 'maker', designerName: 'Test maker',
      price: 100, category: 'apparel', style: 'Dress', size: 'M', images: [],
    })) } }));
    await page.goto('/');
    const grid = page.locator('#product-grid');
    await expect(grid.locator(':scope > .product-card')).toHaveCount(4);
    // The invitation and collection heading must each occupy their own full row.
    await expect(grid.locator('.house-founding-collection')).toBeVisible();
    const geometry = await grid.evaluate(el => {
      const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      return { grid: box(el), invitation: box(el.querySelector('.house-shop-invitation')), heading: box(el.querySelector('.house-founding-collection')), cards: [...el.querySelectorAll('.product-card')].map(box), photos: [...el.querySelectorAll('.product-image')].map(box), overflow: document.documentElement.scrollWidth };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(width);
    expect(Math.abs(geometry.invitation.width - geometry.grid.width)).toBeLessThan(2);
    expect(Math.abs(geometry.heading.width - geometry.grid.width)).toBeLessThan(2);
    expect(geometry.heading.height).toBeLessThan(100);
    expect(geometry.cards[0].y).toBeGreaterThanOrEqual(geometry.heading.bottom);
    expect(Math.abs(geometry.cards[0].y - geometry.cards[1].y)).toBeLessThan(2);
    for (const card of geometry.cards) {
      expect(Math.abs(card.width - geometry.cards[0].width)).toBeLessThan(2);
      expect(card.x).toBeGreaterThanOrEqual(geometry.grid.x - 1);
      expect(card.right).toBeLessThanOrEqual(geometry.grid.right + 1);
    }
    for (const photo of geometry.photos) expect(Math.abs(photo.height - geometry.photos[0].height)).toBeLessThan(2);
    await expect(page.locator('.shop-nested-filters > .shop-filter-menu')).toHaveCount(5);
  });
}
