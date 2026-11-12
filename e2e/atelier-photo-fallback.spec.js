const { test, expect } = require('@playwright/test');
const collection = require('../shared/atelier-emine-preview.json');
const piece = collection.find(item => item.images.length > 1);
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64');

test('failed cover advances to another original photo of the same product', async ({ page }) => {
  const attempts = [];
  await page.route('https://www.atelieremine.com/**', route => {
    const url = route.request().url();
    attempts.push(url);
    return route.fulfill(url === piece.images[1]
      ? { contentType: 'image/png', body: pixel }
      : { status: 403, body: 'Unavailable test fixture' });
  });
  await page.goto('/atelier-emine');
  await page.getByRole('searchbox', { name: 'Search the collection' }).fill(piece.sku);
  const card = page.locator(`[id="preview-${piece.sku}"]`);
  const cover = card.getByRole('img', { name: `${piece.name} by Atelier Emine`, exact: true });
  // The cover is replaced when its source fails; scroll its stable parent instead.
  await card.scrollIntoViewIfNeeded();
  await expect(cover).toHaveAttribute('src', piece.images[1]);
  await expect.poll(() => cover.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(attempts).toContain(piece.images[0]);
  await expect(card).not.toContainText('Photo unavailable');
});

test('unavailable originals leave an honest placeholder without retrying forever', async ({ page }) => {
  // Network requests can include separate detail thumbnails. Track only the cover's
  // error events to verify each source is attempted once by that component.
  await page.addInitScript(alt => {
    window.__coverFailures = [];
    document.addEventListener('error', event => {
      const image = event.target;
      if (image instanceof HTMLImageElement && image.alt === alt) {
        window.__coverFailures.push(image.currentSrc || image.src);
      }
    }, true);
  }, `${piece.name} by Atelier Emine`);
  await page.route('https://www.atelieremine.com/**', route => {
    return route.fulfill({ status: 403, body: 'Unavailable test fixture' });
  });
  await page.goto('/atelier-emine');
  await page.getByRole('searchbox', { name: 'Search the collection' }).fill(piece.sku);
  const card = page.locator(`[id="preview-${piece.sku}"]`);
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('img', { name: `${piece.name} by Atelier Emine: photo unavailable`, exact: true })).toBeVisible();
  // Closed detail thumbnails remain mounted and lazy; only the failed cover is replaced.
  await expect(card.getByRole('img', { name: `${piece.name} by Atelier Emine`, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__coverFailures)).toEqual([...new Set(piece.images)]);
  await expect(card.getByRole('heading', { name: piece.name, exact: true })).toBeVisible();
});
