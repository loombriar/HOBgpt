const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test(`dark mode keeps creative descriptions and activity buttons readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/creative-house.html');
    await page.locator('#hob-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-hob-theme', 'dark');
    const contrast = () => page.locator('.creative-category-heading>p:last-child, #creative-workflow-help, .creative-workflow-options button, .creative-path small').evaluateAll(elements => {
      const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
      const luminance = c => c.slice(0,3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum,v,i) => sum + v * [.2126,.7152,.0722][i], 0);
      return elements.map(element => {
        let background = [0,0,0,0];
        for (let parent = element; parent; parent = parent.parentElement) {
          const candidate = rgb(getComputedStyle(parent).backgroundColor);
          if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
        }
        const foreground = luminance(rgb(getComputedStyle(element).color));
        const surface = luminance(background);
        return { text: element.textContent.trim(), ratio: (Math.max(foreground,surface) + .05) / (Math.min(foreground,surface) + .05) };
      });
    });
    await expect.poll(async () => Math.min(...(await contrast()).map(result => result.ratio)), { message: 'Text must reach 4.5:1 contrast after the theme transition' }).toBeGreaterThanOrEqual(4.5);
  });
}
