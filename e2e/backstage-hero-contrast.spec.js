const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test(`Backstage hero copy stays readable in both themes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/creative-house.html');
    const panel = page.locator('.briar-text-hero .briar-creative-copy');
    await expect(panel.getByRole('heading', { level: 1 })).toBeVisible();

    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-hob-theme') !== theme) {
        await page.locator('#hob-theme-toggle').click();
      }
      await expect(page.locator('html')).toHaveAttribute('data-hob-theme', theme);
      await expect(panel).toHaveCSS('background-image', 'none');
      await expect.poll(async () => panel.locator('h1, h1 em, p').evaluateAll(elements => {
        const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
        const luminance = color => color.slice(0, 3).map(value => {
          value /= 255;
          return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        return Math.min(...elements.map(element => {
          let background;
          for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            const color = rgb(getComputedStyle(ancestor).backgroundColor);
            if (color.length === 3 || color[3] === 1) { background = color; break; }
          }
          if (!background) throw new Error('No opaque background behind Backstage hero text');
          const foreground = luminance(rgb(getComputedStyle(element).color));
          const backdrop = luminance(background);
          return (Math.max(foreground, backdrop) + .05) / (Math.min(foreground, backdrop) + .05);
        }));
      }), { message: `All hero copy needs at least 4.5:1 contrast in ${theme} mode` }).toBeGreaterThanOrEqual(4.5);
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
